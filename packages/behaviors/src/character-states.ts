import {
  Animator,
  RigidBody,
  SIMULATION_TIME_EPSILON,
  type RoleDefinition,
  type RoleGraph,
  type StateContext,
  type StateMachine,
  type StateTransitionJson,
} from '@waica/engine'
import { playsOwnOneShot, takesTrigger } from './own-one-shot-clip.js'
import { CharacterMotor } from './character-motor.js'
import { MeleeAttack } from './melee-attack.js'

/** Planar speed, in units per second, above which a grounded character is moving rather than standing. */
const MOVE_THRESHOLD = 0.1

/** How far through its clip the attack lands (issue #181 inference 10). */
const STRIKE_AT = 0.4

/** Seconds an attack lasts without a one-shot clip of its own, which would never report clip:end. */
const ATTACK_WITHOUT_CLIP = 0.5

/**
 * The 'character' role (issue #166 CA-15): the 3D character you control. Its
 * four default states share one observer; they differ only in the edges
 * their prefab data declares, and an Animator beside the machine plays the
 * clip of each state. Issue #181 adds `run`, `attack` and `roll`: they are
 * entered only when the motor runs or rolls, or on an attack press beside a
 * MeleeAttack, so a character without them stays in the first four.
 */

/** The ground states' ways into the actions: attack and roll first, so a press wins over walking on. */
const ACTIONS: StateTransitionJson[] = [
  { on: 'signal:attack', to: 'attack' },
  { on: 'signal:roll', to: 'roll' },
]

/** Leaving the ground, from any ground state. */
const AIRBORNE: StateTransitionJson[] = [
  { on: 'signal:rise', to: 'jump' },
  { on: 'signal:fall', to: 'fall' },
]

/** The state graph a 3D character starts with, as prefab data. */
export const CHARACTER_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [...ACTIONS, { on: 'signal:move', to: 'walk' }, { on: 'signal:run', to: 'run' }, ...AIRBORNE],
    },
    walk: {
      transitions: [...ACTIONS, { on: 'signal:stop', to: 'idle' }, { on: 'signal:run', to: 'run' }, ...AIRBORNE],
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
    run: {
      transitions: [...ACTIONS, { on: 'signal:stop', to: 'idle' }, { on: 'signal:move', to: 'walk' }, ...AIRBORNE],
    },
    attack: { transitions: [{ on: 'clip:end', to: 'idle' }] },
    roll: {
      transitions: [
        { on: 'signal:stop', to: 'idle' },
        { on: 'signal:move', to: 'walk' },
        { on: 'signal:run', to: 'run' },
        ...AIRBORNE,
      ],
    },
  },
}

/**
 * An attack press beside a MeleeAttack, taken (consumed) here so it does one
 * thing — only by a state with a `signal:attack` edge, so a graph's own
 * `input:attack` edge still sees the press.
 */
function takesAttack({ entity, fsm, game }: StateContext, motor: CharacterMotor | undefined): boolean {
  const action = motor?.attackAction ?? 'attack'
  if (!entity.get(MeleeAttack) || !takesTrigger(fsm, 'signal:attack')) return false
  if (!game.input.justPressed(action) || game.input.consumed(action)) return false
  game.input.consume(action)
  return true
}

/**
 * The observer every default state runs: the CharacterMotor keeps reading the
 * input in its own update and the engine's character controller moves the
 * body, so this only reads the kinematic RigidBody and reports what it is
 * doing as signals — `land` plus `move`, `run` or `stop` on the ground, `rise`
 * or `fall` in the air once it has vertical speed; `roll` while the motor
 * rolls, and `attack` for an attack press on the ground beside a MeleeAttack.
 * Air without vertical speed reports nothing: the body is not grounded
 * before its first physics step (the spawn, every step while Rapier loads,
 * the step after a teleport), and that is not a fall (review of PR #169).
 * Unmatched signals are no-ops.
 */
export function characterUpdate(context: StateContext): void {
  const { entity, fsm } = context
  const body = entity.get(RigidBody)
  if (body?.type !== 'kinematic') return
  const motor = entity.get(CharacterMotor)
  if (motor?.rolling) {
    // A roll starts on the ground: on the landing step of a jump, land first so the air state hands over to it.
    if (body.grounded) fsm.signal('land')
    fsm.signal('roll')
    return
  }
  const { x, y, z } = body.linearVelocity
  if (body.grounded) {
    groundSignals(context, motor, Math.hypot(x, z))
  } else if (y > 0) {
    fsm.signal('rise')
  } else if (y < 0) {
    fsm.signal('fall')
  }
}

/** On the ground: `land`, an `attack` press, then `stop`, `run` or `move` by the planar speed. */
function groundSignals(context: StateContext, motor: CharacterMotor | undefined, planarSpeed: number): void {
  const { fsm } = context
  fsm.signal('land')
  if (takesAttack(context, motor)) fsm.signal('attack')
  if (planarSpeed <= MOVE_THRESHOLD) fsm.signal('stop')
  else fsm.signal(motor?.running ? 'run' : 'move')
}

/** Machines whose current attack has already struck: one blow per attack. */
const struckThisAttack = new WeakSet<StateMachine>()

/** The attack's strike: once, as its own one-shot clip passes STRIKE_AT, or at once without one. */
function attackUpdate({ entity, fsm }: StateContext): void {
  const animator = entity.get(Animator)
  const clip = animator && playsOwnOneShot(animator, fsm) ? animator : null
  const progress = clip ? clip.clipProgress : 1
  if (!struckThisAttack.has(fsm) && progress >= STRIKE_AT) {
    struckThisAttack.add(fsm)
    entity.get(MeleeAttack)?.strike()
  }
  // Without its own one-shot clip nothing ever reports clip:end: the attack ends on time instead.
  if (!clip && fsm.elapsed + SIMULATION_TIME_EPSILON >= ATTACK_WITHOUT_CLIP) fsm.goto('idle')
}

/** The attack holds the character in place while it lasts (CharacterMotor.acting). */
function holdStill(acting: boolean): (context: StateContext) => void {
  return ({ entity, fsm }) => {
    const motor = entity.get(CharacterMotor)
    if (motor) motor.acting = acting
    if (acting) struckThisAttack.delete(fsm)
  }
}

export const CHARACTER_ROLE: RoleDefinition = {
  description:
    'You control this 3D character with the project controls: it walks on the ' +
    'world axes or relative to the orbit camera, runs, rolls, turns to face ' +
    'where it goes, jumps and attacks with a MeleeAttack beside it, through ' +
    'the engine’s character controller. Its states observe the body and an ' +
    'Animator beside them plays each state’s clip.',
  driver: 'CharacterMotor',
  graph: CHARACTER_STATE_GRAPH,
  signals: {
    move: 'on the ground and walking',
    stop: 'on the ground and standing still',
    rise: 'airborne, going up',
    fall: 'airborne, going down',
    land: 'standing on something',
    run: 'on the ground and running',
    roll: 'rolling (the motor’s dodge)',
    attack: 'an attack press on the ground, beside a MeleeAttack',
  },
  states: {
    // Fallback: a custom state without its own onUpdate keeps observing the body.
    default: { onUpdate: characterUpdate },
    idle: { onUpdate: characterUpdate },
    walk: { onUpdate: characterUpdate },
    jump: { onUpdate: characterUpdate },
    fall: { onUpdate: characterUpdate },
    run: { onUpdate: characterUpdate },
    roll: { onUpdate: characterUpdate },
    attack: { onEnter: holdStill(true), onUpdate: attackUpdate, onExit: holdStill(false) },
  },
}
