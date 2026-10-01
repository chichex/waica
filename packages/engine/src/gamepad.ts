/**
 * Gamepad sources for Actions (ADR 0023): the `Gamepad:<control>` binding
 * vocabulary over the W3C `standard` mapping, the radial dead zone, and the
 * player-1 pad slot. `Input` consumes this module; behaviors never see a pad.
 */

/** The slice of the W3C `Gamepad` object Waica reads, so tests can hand in plain objects. */
export interface GamepadLike {
  readonly index: number
  readonly id: string
  readonly mapping: string
  readonly connected: boolean
  readonly axes: readonly number[]
  readonly buttons: readonly { readonly value: number }[]
}

/** One pad control a binding code names: a button by index, or one half of a stick axis. */
export type GamepadControl =
  | { kind: 'button'; index: number }
  | { kind: 'stick'; axis: number; sign: 1 | -1 }

export const GAMEPAD_CODE_PREFIX = 'Gamepad:'

/** Radial dead zone used when `GameOptions.gamepadDeadZone` is absent or invalid. */
export const DEFAULT_GAMEPAD_DEAD_ZONE = 0.2

/** Standard-mapping buttons in W3C index order (0–16). */
const BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LeftStick', 'RightStick',
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight', 'Home',
] as const

/** Stick halves: axes 0/1 are the left stick, 2/3 the right; "Up" is the negative Y axis. */
const STICK_HALVES: Readonly<Record<string, { axis: number; sign: 1 | -1 }>> = {
  LeftStickLeft: { axis: 0, sign: -1 },
  LeftStickRight: { axis: 0, sign: 1 },
  LeftStickUp: { axis: 1, sign: -1 },
  LeftStickDown: { axis: 1, sign: 1 },
  RightStickLeft: { axis: 2, sign: -1 },
  RightStickRight: { axis: 2, sign: 1 },
  RightStickUp: { axis: 3, sign: -1 },
  RightStickDown: { axis: 3, sign: 1 },
}

const CONTROLS = new Map<string, GamepadControl>([
  ...BUTTON_NAMES.map((name, index): [string, GamepadControl] => [
    `${GAMEPAD_CODE_PREFIX}${name}`,
    { kind: 'button', index },
  ]),
  ...Object.entries(STICK_HALVES).map(([name, half]): [string, GamepadControl] => [
    `${GAMEPAD_CODE_PREFIX}${name}`,
    { kind: 'stick', ...half },
  ]),
])

/** Every known `Gamepad:` code: buttons in index order, then the stick halves. */
export const GAMEPAD_CODES: readonly string[] = [...CONTROLS.keys()]

/** The control a binding code names; undefined for a keyboard code or an unknown pad name. */
export function gamepadControl(code: string): GamepadControl | undefined {
  const control = CONTROLS.get(code)
  return control ? { ...control } : undefined
}

/**
 * Radial dead zone: a stick shorter than `deadZone` reads as centered on
 * both axes; past it the direction is kept and the magnitude is rescaled
 * to `(m − d) / (1 − d)`, clamped to 1.
 */
export function radialDeadZone(x: number, y: number, deadZone: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y)
  if (magnitude === 0 || magnitude < deadZone) return { x: 0, y: 0 }
  const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone))
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled }
}

/** The configured dead zone if it is a finite number in [0, 1); otherwise warns once and uses the default. */
export function resolveGamepadDeadZone(value: number | undefined, warn: (message: string) => void): number {
  if (value === undefined) return DEFAULT_GAMEPAD_DEAD_ZONE
  if (Number.isFinite(value) && value >= 0 && value < 1) return value
  warn(
    `[waica] gamepadDeadZone must be a finite number from 0 up to (not including) 1; ` +
      `got ${String(value)}, using ${DEFAULT_GAMEPAD_DEAD_ZONE}.`,
  )
  return DEFAULT_GAMEPAD_DEAD_ZONE
}

/** Each known code's 0..1 value on this pad: buttons by `value`, stick halves dead-zoned per stick. */
export function gamepadValues(pad: GamepadLike, deadZone: number): Map<string, number> {
  const axis = (index: number): number => pad.axes[index] ?? 0
  const sticks = [
    radialDeadZone(axis(0), axis(1), deadZone),
    radialDeadZone(axis(2), axis(3), deadZone),
  ]
  const values = new Map<string, number>()
  for (const [code, control] of CONTROLS) {
    if (control.kind === 'button') {
      values.set(code, pad.buttons[control.index]?.value ?? 0)
      continue
    }
    const stick = sticks[control.axis >> 1] ?? { x: 0, y: 0 }
    const component = control.axis % 2 === 0 ? stick.x : stick.y
    values.set(code, Math.max(0, component * control.sign))
  }
  return values
}

/** The browser's pads, or none where the Gamepad API is missing or refused (Node, happy-dom, a policy-blocked frame). */
export function connectedGamepads(): readonly (GamepadLike | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
  try {
    return navigator.getGamepads()
  } catch {
    // A permissions policy can make getGamepads throw; input stays keyboard-only.
    return []
  }
}

/**
 * Player 1's pad: the first `standard` pad to connect, sticky until it
 * disconnects; then the next one in connection order takes over. Order is
 * the order polls first saw each pad (by index on the same poll).
 */
export class GamepadSlot {
  private order: string[] = []
  private activeKey: string | null = null
  /** True when the poll that just ran lost the pad that was active before it. */
  lostActive = false

  poll(pads: readonly (GamepadLike | null)[]): GamepadLike | null {
    const present = new Map<string, GamepadLike>()
    for (const pad of pads) if (isStandardPad(pad)) present.set(slotKey(pad), pad)
    this.order = this.order.filter((key) => present.has(key))
    for (const key of present.keys()) if (!this.order.includes(key)) this.order.push(key)
    const previous = this.activeKey
    this.activeKey = this.order[0] ?? null
    this.lostActive = previous !== null && previous !== this.activeKey
    return this.activeKey === null ? null : (present.get(this.activeKey) ?? null)
  }
}

/** A connected pad with the W3C `standard` mapping; any other pad is ignored entirely. */
export function isStandardPad(pad: GamepadLike | null | undefined): pad is GamepadLike {
  return pad?.connected === true && pad.mapping === 'standard'
}

function slotKey(pad: GamepadLike): string {
  return `${pad.index}|${pad.id}`
}
