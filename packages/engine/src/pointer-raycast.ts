import * as THREE from 'three/webgpu'
import { Model } from './components/model.js'
import type { Entity } from './entity.js'
import type { PointerPick } from './pointer.js'

/** A position inside the letterboxed game viewport, as fractions of its width and height. */
export interface ViewportFraction {
  nx: number
  ny: number
}

const raycaster = new THREE.Raycaster()
/** The ground of a 3D scene: y = 0, normal up. */
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/** Every live Model's root, with the entity that owns it. */
function modelRoots(entities: readonly Entity[]): Map<THREE.Object3D, Entity> {
  const roots = new Map<THREE.Object3D, Entity>()
  for (const entity of entities) {
    if (!entity.alive) continue
    for (const component of entity.components) {
      if (component instanceof Model && component.root) roots.set(component.root, entity)
    }
  }
  return roots
}

/** The entity whose Model root `object` hangs under. */
function ownerOf(object: THREE.Object3D, roots: ReadonlyMap<THREE.Object3D, Entity>): Entity | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const entity = roots.get(node)
    if (entity) return entity
  }
  return null
}

/**
 * The pick for a click on a 3D scene (issue #154 CA-12): a ray through the
 * letterboxed point, intersected with the roots of every live Model
 * (recursively, so a glTF's meshes count and a glTF still loading does not).
 * The nearest hit wins, with its world-space point. With no hit the pick has
 * no entity and the point where the ray meets the ground plane y = 0; a ray
 * that never meets it (it looks at the sky) yields no pick.
 */
export function raycastPick(
  camera: THREE.PerspectiveCamera,
  at: ViewportFraction,
  entities: readonly Entity[],
): PointerPick | null {
  camera.updateMatrixWorld()
  raycaster.setFromCamera(new THREE.Vector2(at.nx * 2 - 1, 1 - at.ny * 2), camera)
  const roots = modelRoots(entities)
  // A click can land before the first frame has placed anything.
  for (const root of roots.keys()) root.updateWorldMatrix(true, true)
  const [hit] = raycaster.intersectObjects([...roots.keys()], true)
  if (hit) return { entity: ownerOf(hit.object, roots), point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } }
  const ground = raycaster.ray.intersectPlane(GROUND, new THREE.Vector3())
  return ground ? { entity: null, point: { x: ground.x, y: ground.y, z: ground.z } } : null
}
