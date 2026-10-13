// The helpers of the 3D edit view (issue #173 CA-17), behind the 👁 toggle:
// the scene camera's frustum (its real fov, near, far and aspect), each Sun's
// direction, each PointLight's range and each Collider's shape (sensors alike).
// They are drawn from the scene JSON and the live components every frame.
import { Collider, placePerspectiveCamera, PointLight, resolvePerspectiveCamera, Sun, THREE, type Component, type Entity, type Game } from '@waica/engine'
import type { ViewportLive } from './viewport-live'
import { addOverlay } from './viewport-selection-gizmos'

const HELPER_COLOR = 0xffc857
const COLLIDER_COLOR = 0x6fe3a5
const SUN_ARROW_LENGTH = 2
const CIRCLE_SEGMENTS = 48

/** Three unit great circles (XY, XZ, YZ): a wire sphere that stays light. */
function wireSphere(): THREE.BufferGeometry {
  const points: number[] = []
  for (let index = 0; index < CIRCLE_SEGMENTS; index += 1) {
    const [a, b] = [(index / CIRCLE_SEGMENTS) * Math.PI * 2, ((index + 1) / CIRCLE_SEGMENTS) * Math.PI * 2]
    points.push(Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b), 0)
    points.push(Math.cos(a), 0, Math.sin(a), Math.cos(b), 0, Math.sin(b))
    points.push(0, Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b))
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
}

/** Every live component of `Class`, with its entity. */
function liveComponents<T extends Component>(game: Game, Class: abstract new (...args: never[]) => T): Array<{ entity: Entity; component: T }> {
  return game.entities.filter((entity) => entity.alive).flatMap((entity) => entity.components.filter((c): c is T => c instanceof Class).map((component) => ({ entity, component })))
}

/** One overlay object per live component, created on first sight and dropped with its component. */
function perComponent<T extends Component, O extends THREE.Object3D>(game: Game, create: () => O) {
  const objects = new Map<T, O>()
  return (live: Array<{ entity: Entity; component: T }>): Array<{ entity: Entity; component: T; object: O }> => {
    const present = new Set(live.map(({ component }) => component))
    for (const [component, object] of objects) {
      if (present.has(component)) continue
      object.removeFromParent()
      objects.delete(component)
    }
    return live.map(({ entity, component }) => {
      const object = objects.get(component) ?? create()
      if (!objects.has(component)) addOverlay(game, object)
      objects.set(component, object)
      return { entity, component, object }
    })
  }
}

/** The scene camera's frustum, from its JSON, at the play aspect: the project resolution's, else the viewport's. */
function createFrustum(game: Game) {
  const lens = new THREE.PerspectiveCamera()
  const helper = new THREE.CameraHelper(lens)
  helper.name = 'waica:editor-frustum'
  const material = helper.material as THREE.LineBasicMaterial
  material.transparent = true
  material.opacity = 0.45
  addOverlay(game, helper)
  return (live: ViewportLive, visible: boolean): void => {
    helper.visible = visible
    if (!visible) return
    const json = live.scene.camera?.kind === 'perspective' ? live.scene.camera : undefined
    const viewport = game.cameraRig.sceneCamera
    const aspect = live.resolution ? live.resolution.width / live.resolution.height : viewport instanceof THREE.PerspectiveCamera ? viewport.aspect : 1
    placePerspectiveCamera(lens, resolvePerspectiveCamera(json), aspect)
    lens.updateMatrixWorld()
    helper.update()
  }
}

/** A wire for a Collider's shape, in its entity's local frame. */
function colliderWire(collider: Collider): THREE.LineSegments {
  const material = new THREE.LineBasicMaterial({ color: COLLIDER_COLOR, transparent: true, opacity: 0.8 })
  if (collider.shape === 'sphere') {
    const wire = new THREE.LineSegments(wireSphere(), material)
    wire.scale.setScalar(collider.radius)
    return wire
  }
  if (collider.shape === 'capsule') {
    const length = Math.max(collider.height - 2 * collider.radius, 0)
    return new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.CapsuleGeometry(collider.radius, length, 2, 12)), material)
  }
  return new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...collider.size)), material)
}

/** Each Collider's wire, rebuilt when its shape changes, riding its entity's world transform. */
function createColliderWires(game: Game) {
  const place = perComponent<Collider, THREE.Group>(game, () => {
    const holder = new THREE.Group()
    holder.name = 'waica:editor-collider'
    holder.matrixAutoUpdate = false
    return holder
  })
  return (visible: boolean): void => {
    for (const { entity, component, object } of place(liveComponents(game, Collider))) {
      object.visible = visible
      if (!visible) continue
      const key = JSON.stringify([component.shape, component.size, component.radius, component.height])
      if (object.userData.shapeKey !== key) {
        object.clear()
        object.add(colliderWire(component))
        object.userData.shapeKey = key
      }
      object.children[0]?.position.set(...component.offset)
      entity.node.updateWorldMatrix(true, false)
      object.matrix.copy(entity.node.matrixWorld)
      // A hand-set matrix: three recomputes the world matrix only when told to.
      object.matrixWorldNeedsUpdate = true
    }
  }
}

export function createHelpers3d(game: Game) {
  const frustum = createFrustum(game)
  const sphere = wireSphere()
  const arrows = perComponent<Sun, THREE.ArrowHelper>(game, () => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), SUN_ARROW_LENGTH, HELPER_COLOR)
    arrow.name = 'waica:editor-sun-direction'
    return arrow
  })
  const ranges = perComponent<PointLight, THREE.LineSegments>(game, () => {
    const range = new THREE.LineSegments(sphere, new THREE.LineBasicMaterial({ color: HELPER_COLOR, transparent: true, opacity: 0.6 }))
    range.name = 'waica:editor-light-range'
    return range
  })
  const colliders = createColliderWires(game)
  return {
    sync(live: ViewportLive, visible: boolean): void {
      frustum(live, visible)
      for (const { entity, component, object } of arrows(liveComponents(game, Sun))) {
        object.visible = visible
        entity.node.getWorldPosition(object.position)
        object.setDirection(new THREE.Vector3(...component.direction).normalize())
      }
      for (const { entity, component, object } of ranges(liveComponents(game, PointLight))) {
        // A distance of 0 is unlimited: no ring to draw (issue #173 inference 16).
        object.visible = visible && component.distance > 0
        entity.node.getWorldPosition(object.position).add(new THREE.Vector3(component.offsetX, component.offsetY, component.offsetZ))
        object.scale.setScalar(component.distance)
      }
      colliders(visible)
    },
  }
}
