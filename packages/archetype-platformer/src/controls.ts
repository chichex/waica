import type { InputBindings } from '@waica/engine'

/** Platformer actions: the exact legacy keyboard defaults plus the left stick, D-pad and A (ADR 0023). */
export const PLATFORMER_BINDINGS: Readonly<InputBindings> = {
  left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
  right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
  jump: ['Space', 'ArrowUp', 'KeyW', 'Gamepad:A'],
}

/** Friendly labels shown by the editor's controls panel. */
export const PLATFORMER_ACTION_LABELS: Readonly<Record<string, string>> = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
}
