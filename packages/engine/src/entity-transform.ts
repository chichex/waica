import * as THREE from 'three/webgpu'
import type { Entity } from './entity.js'

/** A scene entity's position: `[x, y]` (z is 0) or `[x, y, z]`. */
export type PositionJson = [number, number] | [number, number, number]

/** The transform a scene or prefab entity declares, applied when it spawns. */
export interface TransformJson {
  /** `[x, y]` (z = 0) or `[x, y, z]`; in a 3D scene z is a world axis. */
  position?: PositionJson
  /** Euler angles in degrees, order XYZ, applied to the entity's node (3D scenes). */
  rotation?: [number, number, number]
  /** Per-axis scale of the entity's node. */
  scale?: [number, number, number]
}

/**
 * Applies a declared transform to a freshly spawned entity. A two-number
 * position behaves exactly as it always did (z = 0); `rotation` is converted
 * from degrees and `scale` replaces the node's unit scale.
 */
export function applyTransformJson(entity: Entity, json: TransformJson): void {
  const { position, rotation, scale } = json
  if (position) entity.position.set(position[0], position[1], position[2] ?? 0)
  if (rotation) {
    const [x, y, z] = rotation
    entity.node.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ')
  }
  if (scale) entity.node.scale.set(scale[0], scale[1], scale[2])
}
