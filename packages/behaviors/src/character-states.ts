import { RigidBody, type RoleDefinition, type RoleGraph, type StateContext } from '@waica/engine'

/** Planar speed, in units per second, above which a grounded character is moving rather than standing. */
const MOVE_THRESHOLD = 0.1

/**
 * The 'character' role (issue #166 CA-15): the 3D character you control. Its
 * four default states share one observer; they differ only in the edges
 * their prefab data declares, and an Animator beside the machine plays the
 * clip of each state.
 */

/** The state graph a 3D character starts with, as prefab data. */
export const CHARACTER_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [
        { on: 'signal:move', to: 'walk' },
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:fall', to: 'fall' },
      ],
    },
    walk: {
      transitions: [
        { on: 'signal:stop', to: 'idle' },
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:fall', to: 'fall' },
      ],
    },
    jump: {
      transitions: [
        { on: 'signal:fall', to: 'fall' },
        { on: 'signal:land', to: 'idle' },
      ],
    },
    fall: {
      transitions: [
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:land', to: 'idle' },
      ],
    },
  },
}

/**
 * The observer every default state runs: the CharacterMotor keeps reading the
 * input in its own update and the engine's character controller moves the
 * body, so this only reads the kinematic RigidBody and reports what it is
 * doing as signals — `land` plus `move` or `stop` on the ground, `rise` or
 * `fall` in the air. Unmatched signals are no-ops.
 */
export function characterUpdate({ entity, fsm }: StateContext): void {
  const body = entity.get(RigidBody)
  if (body?.type !== 'kinematic') return
  const { x, y, z } = body.linearVelocity
  if (body.grounded) {
    fsm.signal('land')
    fsm.signal(Math.hypot(x, z) > MOVE_THRESHOLD ? 'move' : 'stop')
  } else {
    fsm.signal(y > 0 ? 'rise' : 'fall')
  }
}

export const CHARACTER_ROLE: RoleDefinition = {
  description:
    'You control this 3D character with the project controls: it walks on the ' +
    'world axes, turns to face where it goes and jumps, through the engine’s ' +
    'character controller. Its states observe the body and an Animator beside ' +
    'them plays each state’s clip.',
  driver: 'CharacterMotor',
  graph: CHARACTER_STATE_GRAPH,
  signals: {
    move: 'on the ground and walking',
    stop: 'on the ground and standing still',
    rise: 'airborne, going up',
    fall: 'airborne, going down',
    land: 'standing on something',
  },
  states: {
    // Fallback: a custom state without its own onUpdate keeps observing the body.
    default: { onUpdate: characterUpdate },
    idle: { onUpdate: characterUpdate },
    walk: { onUpdate: characterUpdate },
    jump: { onUpdate: characterUpdate },
    fall: { onUpdate: characterUpdate },
  },
}
