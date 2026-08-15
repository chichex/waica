import type { InputBindings } from '@waica/engine'

/** Top-down actions: four directions plus interact, arrows and WASD. */
export const TOPDOWN_BINDINGS: Readonly<InputBindings> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  interact: ['KeyE', 'Space'],
}

/** Friendly labels shown by the editor's controls panel. */
export const TOPDOWN_ACTION_LABELS: Readonly<Record<string, string>> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  interact: 'Interact',
}
