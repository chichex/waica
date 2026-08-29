import type { InputBindings } from '@waica/engine'

export const ISOMETRIC_BINDINGS: Readonly<InputBindings> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  interact: ['KeyE', 'Space'],
  attack: ['KeyX', 'KeyJ'],
}

export const ISOMETRIC_ACTION_LABELS: Readonly<Record<string, string>> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  interact: 'Interact',
  attack: 'Attack',
}
