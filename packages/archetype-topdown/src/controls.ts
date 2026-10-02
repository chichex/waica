import type { InputBindings } from '@waica/engine'

/** Top-down actions: four directions plus interact; arrows and WASD, the left stick, D-pad and A (ADR 0023). */
export const TOPDOWN_BINDINGS: Readonly<InputBindings> = {
  up: ['ArrowUp', 'KeyW', 'Gamepad:LeftStickUp', 'Gamepad:DPadUp'],
  down: ['ArrowDown', 'KeyS', 'Gamepad:LeftStickDown', 'Gamepad:DPadDown'],
  left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
  right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
  interact: ['KeyE', 'Space', 'Gamepad:A'],
}

/** Friendly labels shown by the editor's controls panel. */
export const TOPDOWN_ACTION_LABELS: Readonly<Record<string, string>> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  interact: 'Interact',
}
