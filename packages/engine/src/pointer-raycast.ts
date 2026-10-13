import * as THREE from 'three/webgpu'
import { Model } from './components/model.js'
import type { Entity } from './entity.js'

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

/** What an extra target picks: an entity (an editor's icon for it), or the scene camera's icon. */
export type PickedTarget = Entity | 'camera'

/** An object a ray is also tested against, and what a hit on it picks (issue #173 CA-2). */
export interface PickTarget<Picked extends PickedTarget = PickedTarget> {
  readonly object: THREE.Object3D
  readonly entity: Picked
}

/** A 3D pick: the hit's world point, and the entity (or extra target) hit, or null on the ground. */
export interface RaycastPick<Picked extends PickedTarget = Entity> {
  readonly point: { readonly x: number; readonly y: number; readonly z: number }
  readonly entity: Entity | Picked | null
}

/** What `object` picks: the target or Model root it hangs under, nearest first. */
function ownerOf<Picked extends PickedTarget>(object: THREE.Object3D, owners: ReadonlyMap<THREE.Object3D, Entity | Picked>): Entity | Picked | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const owner = owners.get(node)
    if (owner) return owner
  }
  return null
}

/** Whether `target` is drawn and still picks something: itself and every ancestor visible, and its entity alive. */
function isPickable(target: PickTarget): boolean {
  if (target.entity !== 'camera' && !target.entity.alive) return false
  for (let node: THREE.Object3D | null = target.object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

/** The extra targets' hits: tested whatever their layers, since an editor overlay lives on the Emissive layer alone. */
function extraHits(targets: readonly PickTarget[]): THREE.Intersection[] {
  if (targets.length === 0) return []
  const own = raycaster.layers.mask
  raycaster.layers.enableAll()
  try {
    return raycaster.intersectObjects(targets.filter(isPickable).map((target) => target.object), true)
  } finally {
    raycaster.layers.mask = own
  }
}

/**
 * The pick for a click on a 3D scene (issue #154 CA-12): a ray through the
 * letterboxed point, intersected with the roots of every live Model
 * (recursively, so a glTF's meshes count, posed where its skeleton is, and a
 * glTF still loading does not) and with the `extra` targets a host adds (the
 * editor's icons, issue #173 CA-2; one that is hidden, or whose entity is
 * dead, is skipped). The nearest hit wins, with its
 * world-space point. With no hit the pick has no entity and the point where
 * the ray meets the ground plane y = 0; a ray that never meets it (it looks
 * at the sky) yields no pick.
 */
// eslint-disable-next-line max-params -- the signature spec #173 fixes: the Pointer's three inputs plus the optional extra targets; bundling them would be an unrelated bag
export function raycastPick<Picked extends PickedTarget = Entity>(
  camera: THREE.PerspectiveCamera,
  at: ViewportFraction,
  entities: readonly Entity[],
  extra: readonly PickTarget<Picked>[] = [],
): RaycastPick<Picked> | null {
  camera.updateMatrixWorld()
  raycaster.setFromCamera(new THREE.Vector2(at.nx * 2 - 1, 1 - at.ny * 2), camera)
  const roots = modelRoots(entities)
  const owners = new Map<THREE.Object3D, Entity | Picked>(roots)
  for (const target of extra) owners.set(target.object, target.entity)
  // A click can land before the first frame has placed anything.
  for (const object of owners.keys()) object.updateWorldMatrix(true, true)
  const [hit] = [...raycaster.intersectObjects([...roots.keys()], true), ...extraHits(extra)].sort((a, b) => a.distance - b.distance)
  if (hit) return { entity: ownerOf(hit.object, owners), point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } }
  const ground = raycaster.ray.intersectPlane(GROUND, new THREE.Vector3())
  return ground ? { entity: null, point: { x: ground.x, y: ground.y, z: ground.z } } : null
}
