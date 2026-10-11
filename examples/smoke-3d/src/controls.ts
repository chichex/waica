import type { InputBindings } from '@waica/engine'

// The engine has no action vocabulary of its own: the Player's CharacterMotor
// reads these five (arrows and WASD to walk on the ground plane, Space to jump).
export const BINDINGS: Readonly<InputBindings> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space'],
}
