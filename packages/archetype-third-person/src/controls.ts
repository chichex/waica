import type { InputBindings } from '@waica/engine'

/**
 * Third-person actions (issue #181 G-17): move with WASD, the arrows or the
 * left stick; jump, attack, run and dodge; orbit with the locked mouse (the
 * camera reads it), Q/E or the right stick. The first click only takes the
 * pointer lock, so attacking with the mouse starts on the second.
 */
export const THIRD_PERSON_BINDINGS: Readonly<InputBindings> = {
  up: ['KeyW', 'ArrowUp', 'Gamepad:LeftStickUp'],
  down: ['KeyS', 'ArrowDown', 'Gamepad:LeftStickDown'],
  left: ['KeyA', 'ArrowLeft', 'Gamepad:LeftStickLeft'],
  right: ['KeyD', 'ArrowRight', 'Gamepad:LeftStickRight'],
  jump: ['Space', 'Gamepad:A'],
  attack: ['Mouse:Left', 'KeyJ', 'Gamepad:X'],
  run: ['ShiftLeft', 'ShiftRight', 'Gamepad:LB'],
  dodge: ['KeyC', 'Gamepad:B'],
  look_left: ['KeyQ', 'Gamepad:RightStickLeft'],
  look_right: ['KeyE', 'Gamepad:RightStickRight'],
  look_up: ['Gamepad:RightStickUp'],
  look_down: ['Gamepad:RightStickDown'],
}

export const THIRD_PERSON_ACTION_LABELS: Readonly<Record<string, string>> = {
  up: 'Move forward',
  down: 'Move back',
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
  attack: 'Attack',
  run: 'Run',
  dodge: 'Roll',
  look_left: 'Orbit left',
  look_right: 'Orbit right',
  look_up: 'Look up',
  look_down: 'Look down',
}
