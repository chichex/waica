import type { Entity } from '@waica/engine'

/** How long a 3D melee knockback pushes, in seconds (issue #181 CA-17). */
export const KNOCKBACK_SECONDS = 0.15

/** Float slack on the push's end: steps of 1/60 s never land exactly on it. */
const TIME_EPSILON = 1e-9

/** A planar velocity on the ground plane, in units per second. */
export interface PlanarVelocity {
  x: number
  z: number
}

/** The push on each knocked-back entity and the Game Time it lasts until. */
const pushes = new WeakMap<Entity, { velocity: PlanarVelocity; until: number }>()

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
  pushes.set(target, {
    velocity: { x: (dx / length) * speed, z: (dz / length) * speed },
    until: target.game.time.now + KNOCKBACK_SECONDS,
  })
}

/** The push `entity` is under this Simulation Step, or null once it is over (or there was none). */
export function knockbackVelocity(entity: Entity): PlanarVelocity | null {
  const push = pushes.get(entity)
  if (!push) return null
  if (entity.game.time.now <= push.until + TIME_EPSILON) return push.velocity
  pushes.delete(entity)
  return null
}

/** Ends any push on `entity` at once (a respawn). */
export function clearKnockback(entity: Entity): void {
  pushes.delete(entity)
}
