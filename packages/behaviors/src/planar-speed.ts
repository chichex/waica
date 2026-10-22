import { Animator, RigidBody, type Entity } from '@waica/engine'

/**
 * Writes the planar speed of the entity's body (|linearVelocity| on x and z,
 * units per second) to its Animator's `speed` parameter (issue #205, ADR
 * 0033): a blend over walk and run, like the third-person Knight's
 * Locomotion, follows how fast the body really moves. Nothing happens without
 * both an Animator and a RigidBody.
 */
export function writePlanarSpeed(entity: Entity): void {
  const animator = entity.get(Animator)
  const body = entity.get(RigidBody)
  if (!animator || !body) return
  const { x, z } = body.linearVelocity
  animator.setParam('speed', Math.hypot(x, z))
}
