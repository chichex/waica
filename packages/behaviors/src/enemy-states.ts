import { Animator, SIMULATION_TIME_EPSILON, type Entity, type RoleDefinition, type RoleGraph, type StateContext } from '@waica/engine'
import { Chaser } from './chaser.js'
import { turnYawToward } from './facing-3d.js'
import { Health } from './health.js'
import { knockbackVelocity } from './knockback-3d.js'
import { MeleeAttack } from './melee-attack.js'
import { drive3d, MOVER_TURN_SPEED } from './mover-3d.js'
import { playsOwnOneShot } from './own-one-shot-clip.js'
import { Patrol } from './patrol.js'

/** Seconds the enemy stands still, facing the player, before it strikes (issue #181 inference 15). */
export const ENEMY_WINDUP_SECONDS = 0.6

/** Seconds a one-shot state lasts without a one-shot clip of its own, which would never report clip:end. */
const WITHOUT_CLIP = 0.5

/**
 * The 'enemy' role (issue #181 CA-20): a 3D melee enemy. It patrols (with a
 * Patrol, else it stands), chases the player once they are inside
 * `Chaser.range` and back when they leave, winds up still and facing them
 * within `MeleeAttack.range`, then strikes once. A hit plays `hurt` for its
 * clip and it decides again; a Health death leaves it in `die`, still.
 */
export const ENEMY_STATE_GRAPH: RoleGraph = {
  initial: 'patrol',
  states: {
    patrol: { transitions: [{ on: 'signal:see', to: 'chase' }] },
    chase: {
      transitions: [
        { on: 'signal:near', to: 'windup' },
        { on: 'signal:lose', to: 'patrol' },
      ],
    },
    windup: { transitions: [{ on: `timer:${ENEMY_WINDUP_SECONDS}`, to: 'attack' }] },
    attack: { transitions: [{ on: 'clip:end', to: 'chase' }] },
    hurt: { transitions: [{ on: 'clip:end', to: 'chase' }] },
    die: {},
    // Death first: a lethal hit never lands in hurt, and the edge is what makes Health hand the death to this graph.
    '*': {
      transitions: [
        { on: 'signal:death', to: 'die' },
        { on: 'signal:hurt', to: 'hurt' },
      ],
    },
  },
}

/** A player whose Health is spent (lying in its die state until it respawns) is no prey. */
const isDown = (target: Entity): boolean => target.get(Health)?.current === 0

/** What the enemy sees this step: `see` or `lose` the player, and `near` once they are within its strike. */
function decide({ entity, fsm }: StateContext): void {
  const target = entity.get(Chaser)?.inSight()
  if (!target || isDown(target)) {
    fsm.signal('lose')
    return
  }
  fsm.signal('see')
  const reach = entity.get(MeleeAttack)?.range ?? 0
  const dx = target.position.x - entity.position.x
  const dz = target.position.z - entity.position.z
  if (Math.hypot(dx, dz) <= reach) fsm.signal('near')
}

/** Stands still (a knockback still pushes), turning toward the player when one is in sight. */
function standFacing(entity: Entity, dt: number): void {
  drive3d(entity, { x: 0, z: 0 }, dt)
  const target = entity.get(Chaser)?.inSight()
  if (!target || knockbackVelocity(entity)) return
  turnYawToward(entity.node, target.position.x - entity.position.x, target.position.z - entity.position.z, MOVER_TURN_SPEED, dt)
}

/** A one-shot state whose Animator plays no one-shot clip of its own (or that has none) ends on time, as no clip:end will come. */
function endWithoutClip({ entity, fsm }: StateContext, next: string): void {
  const animator = entity.get(Animator)
  if (animator && playsOwnOneShot(animator, fsm)) return
  if (fsm.elapsed + SIMULATION_TIME_EPSILON >= WITHOUT_CLIP) fsm.goto(next)
}

export const ENEMY_ROLE: RoleDefinition = {
  description:
    'A 3D melee enemy: it patrols with a Patrol, chases the player inside its ' +
    'Chaser range, winds up still and facing them inside its MeleeAttack range, ' +
    'then strikes once. A hit plays hurt for its clip; a death leaves it still in die.',
  driver: 'Chaser',
  graph: ENEMY_STATE_GRAPH,
  signals: {
    see: 'the player is inside Chaser.range',
    lose: 'the player is out of Chaser.range',
    near: 'the player is inside MeleeAttack.range',
  },
  states: {
    patrol: {
      onUpdate(context, dt) {
        const { entity } = context
        const patrol = entity.get(Patrol)
        if (patrol) patrol.step(dt)
        else drive3d(entity, { x: 0, z: 0 }, dt)
        decide(context)
      },
    },
    chase: {
      onUpdate(context, dt) {
        context.entity.get(Chaser)?.step(dt)
        decide(context)
      },
    },
    windup: {
      onUpdate({ entity }, dt) {
        standFacing(entity, dt)
      },
    },
    attack: {
      onEnter({ entity }) {
        entity.get(MeleeAttack)?.strike()
      },
      onUpdate(context, dt) {
        standFacing(context.entity, dt)
        endWithoutClip(context, 'chase')
      },
    },
    hurt: {
      onUpdate(context, dt) {
        drive3d(context.entity, { x: 0, z: 0 }, dt)
        endWithoutClip(context, 'chase')
      },
    },
    die: {
      onUpdate({ entity }, dt) {
        drive3d(entity, { x: 0, z: 0 }, dt)
      },
    },
  },
}
