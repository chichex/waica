import { RigidBody, type Entity } from '@waica/engine'
import { turnYawToward } from './facing-3d.js'
import { knockbackVelocity, type PlanarVelocity } from './knockback-3d.js'

/** How fast a 3D Patrol, Chaser or enemy turns to face its walk, in degrees per second (CharacterMotor's default). */
export const MOVER_TURN_SPEED = 540

/**
 * Asks `entity`'s kinematic body for `velocity` on the ground plane and turns
 * its yaw toward it (issue #181 CA-19): the engine's character controller
 * does the moving, so gravity, steps and walls are its. A knockback in
 * progress wins over `velocity` and turns nothing. False, changing nothing,
 * without a kinematic body.
 */
export function drive3d(entity: Entity, velocity: PlanarVelocity, dt: number): boolean {
  const body = entity.get(RigidBody)
  if (body?.type !== 'kinematic') return false
  const push = knockbackVelocity(entity)
  body.desiredVelocity = push ? { ...push } : { x: velocity.x, z: velocity.z }
  if (!push) turnYawToward(entity.node, velocity.x, velocity.z, MOVER_TURN_SPEED, dt)
  return true
}
