import {
  connectedGamepads,
  GAMEPAD_CODE_PREFIX,
  gamepadControl,
  gamepadValues,
  GamepadSlot,
  resolveGamepadDeadZone,
} from './gamepad.js'

export type ActionName = string
export type InjectedActionOperation = 'press' | 'hold' | 'release'

/** Action → source codes: `KeyboardEvent.code` values and `Gamepad:<control>` codes (ADR 0023). */
export type InputBindings = Record<string, string[]>

/** Neutral engine baseline; archetypes own their action vocabulary. */
export const DEFAULT_BINDINGS: Readonly<InputBindings> = {}

/** A source counts as held at this value or above (keys are always 1 while down). */
const HELD_THRESHOLD = 0.5

export interface InputOptions {
  /** Radial stick dead zone in [0, 1); absent or invalid means 0.2. */
  gamepadDeadZone?: number
}

/**
 * Action-based input with archetype default bindings. Sources are keys and
 * player 1's standard gamepad (ADR 0023); every Action has a 0..1 value, the
 * max across its sources, and is held at 0.5 or above. Touch is still TODO.
 */
export class Input {
  private readonly bindings = new Map<string, Set<string>>()
  private readonly down = new Set<string>()
  private readonly justDown = new Set<string>()
  private readonly injectedHolds = new Map<ActionName, number>()
  private readonly injectedJustDown = new Set<ActionName>()
  private readonly injectedPresses = new Set<ActionName>()
  private readonly used = new Set<string>()
  private readonly deadZone: number
  private readonly padSlot = new GamepadSlot()
  /** Live pad values by code, after the last poll; disarmed codes read 0. */
  private padValues = new Map<string, number>()
  /** Pad codes released while held: they count again only after dropping below the threshold. */
  private readonly disarmed = new Set<string>()
  private readonly padJustDown = new Set<ActionName>()

  /** Installs exactly the action map supplied by the active archetype/project. */
  constructor(bindings: Readonly<InputBindings> = DEFAULT_BINDINGS, options: InputOptions = {}) {
    const warned = new Set<string>()
    for (const [action, codes] of Object.entries(bindings)) {
      this.bindings.set(action, new Set(codes))
      for (const code of codes) warnUnknownPadCode(code, warned)
    }
    this.deadZone = resolveGamepadDeadZone(options.gamepadDeadZone, (message) => {
      console.warn(message)
    })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  /** Is the action held this frame (some source at 0.5 or above)? */
  held(action: ActionName): boolean {
    return this.value(action) >= HELD_THRESHOLD
  }

  /** Was the action pressed exactly this frame? */
  justPressed(action: ActionName): boolean {
    return (
      this.injectedJustDown.has(action) ||
      this.padJustDown.has(action) ||
      this.isActive(action, this.justDown)
    )
  }

  /**
   * The action's 0..1 value: the max across its sources — 1 for a key that
   * is down, a pad button's value, a stick half's dead-zoned component, an
   * injected hold's value. 0 for an unknown or unbound action.
   */
  value(action: ActionName): number {
    const codes = this.bindings.get(action)
    if (!codes) return 0
    let value = this.injectedPresses.has(action) ? 1 : (this.injectedHolds.get(action) ?? 0)
    for (const code of codes) {
      if (this.down.has(code)) return 1
      value = Math.max(value, this.padValues.get(code) ?? 0)
    }
    return value
  }

  /** Installed semantic action names in deterministic order. */
  availableActions(): ActionName[] {
    return [...this.bindings.keys()].sort()
  }

  /**
   * The source codes bound to the action, in their declared order (e.g.
   * `['KeyE', 'Space']`); `[]` for an unknown or unbound action. A new
   * array every call: mutating it never changes the bindings.
   */
  bindingsFor(action: ActionName): string[] {
    return [...(this.bindings.get(action) ?? [])]
  }

  /** Currently held semantic action names in deterministic order. */
  heldActions(): ActionName[] {
    return this.availableActions().filter((action) => this.held(action))
  }

  /** The value of every held action, keyed in the same order as heldActions(). */
  actionValues(): Record<ActionName, number> {
    return Object.fromEntries(this.heldActions().map((action) => [action, this.value(action)]))
  }

  /**
   * Injects an action by semantic name; false means the action is not
   * installed. `hold` takes an optional value in (0, 1] (default 1) and is
   * one more source of the action: below 0.5 it moves it without holding it.
   */
  injectAction(action: ActionName, operation: InjectedActionOperation, value = 1): boolean {
    if (!this.bindings.has(action)) return false
    if (operation === 'release') {
      this.injectedHolds.delete(action)
      this.injectedPresses.delete(action)
      return true
    }
    const wasHeld = this.held(action)
    if (operation === 'hold') {
      // A queued press becomes this persistent hold rather than a second edge.
      this.injectedPresses.delete(action)
      this.injectedHolds.set(action, value)
    } else if (!wasHeld) {
      this.injectedPresses.add(action)
    }
    if (!wasHeld && this.held(action)) this.injectedJustDown.add(action)
    return true
  }

  /** -1..1 axis from two actions (left/right by default): value(positive) − value(negative). */
  axis(negative: ActionName = 'left', positive: ActionName = 'right'): number {
    return this.value(positive) - this.value(negative)
  }

  /**
   * Reads player 1's pad. The Game calls this once per Simulation Step,
   * before component updates; a press edge is reported for every action
   * the pad newly holds.
   */
  pollGamepad(): void {
    const pad = this.padSlot.poll(connectedGamepads())
    if (this.padSlot.lostActive) this.releasePad()
    const wasHeld = new Set(this.heldActions())
    const raw = pad ? gamepadValues(pad, this.deadZone) : new Map<string, number>()
    for (const [code, value] of raw) {
      if (value < HELD_THRESHOLD) this.disarmed.delete(code)
      else if (this.disarmed.has(code)) raw.set(code, 0)
    }
    this.padValues = raw
    for (const action of this.heldActions()) {
      if (!wasHeld.has(action)) this.padJustDown.add(action)
    }
  }

  /**
   * Marks this frame's press of the action as spent, so consumers that
   * honor consumption (state-machine 'input:' triggers) ignore it. One
   * press does one thing: the press that launches a ground jump can't
   * also fire a "key press jump" transition on the very same frame.
   */
  consume(action: ActionName): void {
    this.used.add(action)
  }

  /** Was this frame's press already spent by someone? */
  consumed(action: ActionName): boolean {
    return this.used.has(action)
  }

  /** Called by the Game at the end of each frame. */
  endFrame(): void {
    this.justDown.clear()
    this.injectedJustDown.clear()
    this.padJustDown.clear()
    this.injectedPresses.clear()
    this.used.clear()
  }

  dispose(): void {
    this.injectedHolds.clear()
    this.injectedJustDown.clear()
    this.injectedPresses.clear()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  private isActive(action: ActionName, set: Set<string>): boolean {
    const codes = this.bindings.get(action)
    if (!codes) return false
    for (const code of codes) if (set.has(code)) return true
    return false
  }

  /** Every pad source reads 0; the ones that were held stay released until they drop below the threshold. */
  private releasePad(): void {
    for (const [code, value] of this.padValues) {
      if (value >= HELD_THRESHOLD) this.disarmed.add(code)
    }
    this.padValues = new Map()
    this.padJustDown.clear()
  }

  private releaseAll = (): void => {
    this.down.clear()
    this.justDown.clear()
    this.releasePad()
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.releaseAll()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    this.down.add(e.code)
    this.justDown.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code)
  }
}

/** An unknown `Gamepad:` code never matches; it is reported once per code per Input. */
function warnUnknownPadCode(code: string, warned: Set<string>): void {
  if (!code.startsWith(GAMEPAD_CODE_PREFIX) || warned.has(code) || gamepadControl(code)) return
  warned.add(code)
  console.warn(`[waica] unknown gamepad binding "${code}": it never matches.`)
}
