import type { THREE } from '@waica/engine'

const TAU = Math.PI * 2

/** An angle folded into (-π, π]. */
const wrap = (radians: number): number => Math.atan2(Math.sin(radians), Math.cos(radians))

/**
 * 3D facing (issue #166 CA-13): turns `node` about +y toward the direction
 * (`dirX`, `dirZ`) it walks, so a glTF's front (+z) leads the way. The yaw
 * moves along the shortest arc by at most `turnSpeed` degrees per second over
 * `dt` seconds; `turnSpeed` 0 snaps. A zero direction changes nothing. Shared
 * by the CharacterMotor and any later mover.
 */
// eslint-disable-next-line max-params -- the signature spec #166 fixes: a node, a planar direction, a turn rate and the step; bundling them would be an unrelated bag
export function turnYawToward(node: THREE.Object3D, dirX: number, dirZ: number, turnSpeed: number, dt: number): void {
  if (dirX === 0 && dirZ === 0) return
  const target = Math.atan2(dirX, dirZ)
  if (turnSpeed <= 0) {
    node.rotation.y = target
    return
  }
  const delta = wrap(target - node.rotation.y)
  const limit = (turnSpeed * Math.PI * dt) / 180
  const step = Math.max(-limit, Math.min(limit, delta))
  node.rotation.y = wrap(node.rotation.y + step) % TAU
}
