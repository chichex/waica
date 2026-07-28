import type { InputBindings } from '@waica/engine'

/** Platformer actions and the exact legacy keyboard defaults. */
export const PLATFORMER_BINDINGS: Readonly<InputBindings> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
}

/** Friendly labels shown by the editor's controls panel. */
export const PLATFORMER_ACTION_LABELS: Readonly<Record<string, string>> = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
}
