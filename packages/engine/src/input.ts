export type ActionName = string
export type InjectedActionOperation = 'press' | 'hold' | 'release'

/** Action → KeyboardEvent.code list. */
export type InputBindings = Record<string, string[]>

/** Neutral engine baseline; archetypes own their action vocabulary. */
export const DEFAULT_BINDINGS: Readonly<InputBindings> = {}

/**
 * Action-based input with archetype default bindings.
 * v0: keyboard. TODO(H1): gamepad and touch.
 */
export class Input {
  private readonly bindings = new Map<string, Set<string>>()
  private readonly down = new Set<string>()
  private readonly justDown = new Set<string>()
  private readonly injectedDown = new Set<ActionName>()
  private readonly injectedJustDown = new Set<ActionName>()
  private readonly injectedPresses = new Set<ActionName>()
  private readonly used = new Set<string>()

  /** Installs exactly the action map supplied by the active archetype/project. */
  constructor(bindings: Readonly<InputBindings> = DEFAULT_BINDINGS) {
    for (const [action, codes] of Object.entries(bindings)) {
      this.bindings.set(action, new Set(codes))
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  /** Is the action held this frame? */
  held(action: ActionName): boolean {
    return this.injectedDown.has(action) || this.isActive(action, this.down)
  }

  /** Was the action pressed exactly this frame? */
  justPressed(action: ActionName): boolean {
    return this.injectedJustDown.has(action) || this.isActive(action, this.justDown)
  }

  /** Installed semantic action names in deterministic order. */
  availableActions(): ActionName[] {
    return [...this.bindings.keys()].sort()
  }

  /** Currently held semantic action names in deterministic order. */
  heldActions(): ActionName[] {
    return this.availableActions().filter((action) => this.held(action))
  }

  /** Injects an action by semantic name; false means the action is not installed. */
  injectAction(action: ActionName, operation: InjectedActionOperation): boolean {
    if (!this.bindings.has(action)) return false
    if (operation === 'release') {
      this.injectedDown.delete(action)
      this.injectedPresses.delete(action)
      return true
    }
    if (this.held(action)) {
      if (operation === 'hold') this.injectedPresses.delete(action)
      return true
    }
    this.injectedDown.add(action)
    this.injectedJustDown.add(action)
    if (operation === 'press') this.injectedPresses.add(action)
    return true
  }

  /** -1..1 axis from two actions (left/right by default). */
  axis(negative: ActionName = 'left', positive: ActionName = 'right'): number {
    return (this.held(positive) ? 1 : 0) - (this.held(negative) ? 1 : 0)
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
    for (const action of this.injectedPresses) this.injectedDown.delete(action)
    this.injectedPresses.clear()
    this.used.clear()
  }

  dispose(): void {
    this.injectedDown.clear()
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

  private releaseAll = (): void => {
    this.down.clear()
    this.justDown.clear()
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
