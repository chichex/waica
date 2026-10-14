import { SIMULATION_TIME_EPSILON, type Entity } from '@waica/engine'

/** How long a 3D melee knockback pushes, in seconds (issue #181 CA-17). */
export const KNOCKBACK_SECONDS = 0.15

/** A planar velocity on the ground plane, in units per second. */
export interface PlanarVelocity {
  x: number
  z: number
}

/** The push on each knocked-back entity: the Game Time of the hit, and the one it lasts until. */
const pushes = new WeakMap<Entity, { velocity: PlanarVelocity; since: number; until: number }>()

/**
 * Pushes `target` straight away from `from` on xz at `speed` for
 * KNOCKBACK_SECONDS of Game Time (issue #181 CA-17). Whatever moves the
 * target in 3D — a CharacterMotor, a Patrol, a Chaser, the enemy role's still
 * states — asks its kinematic body for knockbackVelocity() instead of its own
 * while it lasts, so walls stop it like any walk. There is no stun. A target
 * standing exactly where `from` stands, or a speed of 0, is not pushed.
 */
export function knockBackFrom(target: Entity, from: Entity, speed: number): void {
  const dx = target.position.x - from.position.x
  const dz = target.position.z - from.position.z
  const length = Math.hypot(dx, dz)
  if (length === 0 || !(speed > 0)) return
  const { now } = target.game.time
  pushes.set(target, {
    velocity: { x: (dx / length) * speed, z: (dz / length) * speed },
    since: now,
    until: now + KNOCKBACK_SECONDS,
  })
}

/** The push `entity` is under this Simulation Step, or null once it is over (or there was none). */
export function knockbackVelocity(entity: Entity): PlanarVelocity | null {
  const push = pushes.get(entity)
  if (!push) return null
  const { now } = entity.game.time
  // The hit's own step pushes nobody, whether the target updates before or after its attacker: every push starts on the next step and lasts as long.
  if (now <= push.since) return null
  if (now <= push.until + SIMULATION_TIME_EPSILON) return push.velocity
  pushes.delete(entity)
  return null
}

/**
 * The push `entity` is under or about to be under, without spending it: its
 * velocity and the Game Time it lasts until; null with none, or once it is
 * over. What a Runtime Snapshot reports (maintainer decision on issue #181).
 */
export function pendingKnockback(entity: Entity): { x: number; z: number; until: number } | null {
  const push = pushes.get(entity)
  if (!push || entity.game.time.now > push.until + SIMULATION_TIME_EPSILON) return null
  return { ...push.velocity, until: push.until }
}

/** Ends any push on `entity` at once (a respawn). */
export function clearKnockback(entity: Entity): void {
  pushes.delete(entity)
}
