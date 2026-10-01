import type { InputBindings } from '@waica/engine'

/** Isometric actions: screen-relative movement, interact and attack; keys, the left stick, D-pad, A and X (ADR 0023). */
export const ISOMETRIC_BINDINGS: Readonly<InputBindings> = {
  up: ['ArrowUp', 'KeyW', 'Gamepad:LeftStickUp', 'Gamepad:DPadUp'],
  down: ['ArrowDown', 'KeyS', 'Gamepad:LeftStickDown', 'Gamepad:DPadDown'],
  left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
  right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
  interact: ['KeyE', 'Space', 'Gamepad:A'],
  attack: ['KeyX', 'KeyJ', 'Gamepad:X'],
}

export const ISOMETRIC_ACTION_LABELS: Readonly<Record<string, string>> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  interact: 'Interact',
  attack: 'Attack',
}
