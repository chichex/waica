import type { Entity } from '@waica/engine'

/** How long a 3D melee knockback pushes, in seconds (issue #181 CA-17). */
export const KNOCKBACK_SECONDS = 0.15

/** A planar velocity on the ground plane, in units per second. */
export interface PlanarVelocity {
  x: number
  z: number
}

/**
 * A 3D mover a melee hit can push (issue #181 CA-17): for `seconds` it asks
 * its kinematic body for `velocity` instead of its own, so walls stop it like
 * any walk. There is no stun: it moves its own way again once that is over.
 */
export interface KnockbackReceiver {
  knockBack(velocity: PlanarVelocity, seconds: number): void
}

function isKnockbackReceiver(component: unknown): component is KnockbackReceiver {
  return typeof component === 'object' && component !== null && typeof Reflect.get(component, 'knockBack') === 'function'
}

/**
 * Pushes `target`'s mover straight away from `from` on xz at `speed` for
 * KNOCKBACK_SECONDS. A target with no mover, one standing exactly where
 * `from` stands, or a speed of 0 is not pushed.
 */
export function knockBackFrom(target: Entity, from: Entity, speed: number): void {
  const dx = target.position.x - from.position.x
  const dz = target.position.z - from.position.z
  const length = Math.hypot(dx, dz)
  if (length === 0 || !(speed > 0)) return
  for (const component of target.components) {
    if (!isKnockbackReceiver(component)) continue
    component.knockBack({ x: (dx / length) * speed, z: (dz / length) * speed }, KNOCKBACK_SECONDS)
    return
  }
}
