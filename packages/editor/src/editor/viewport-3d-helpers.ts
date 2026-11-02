// The helpers of the 3D edit view (issue #173 CA-17), behind the 👁 toggle:
// the scene camera's frustum (its real fov, near, far and aspect), each Sun's
// direction, each PointLight's range, each SpotLight's cone and each Collider's
// shape (sensors alike).
// They are drawn from the scene JSON and the live components every frame.
import { Collider, placePerspectiveCamera, PointLight, resolvePerspectiveCamera, SpotLight, Sun, THREE, type Component, type Entity, type Game } from '@waica/engine'
import type { ViewportLive } from './viewport-live'
import { addOverlay } from './viewport-selection-gizmos'

export const HELPER_COLOR = 0xffc857
const COLLIDER_COLOR = 0x6fe3a5
const SUN_ARROW_LENGTH = 2
const CIRCLE_SEGMENTS = 48
const CONE_SPOKES = 8
/** The axis a unit wire cone points along before it is aimed at a light's direction. */
const CONE_AXIS = new THREE.Vector3(0, 0, 1)

/** The amber line material of the light helpers, so a range, a cone and a shadow coverage read as one family. */
export function helperLineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: HELPER_COLOR, transparent: true, opacity: 0.6 })
}

/** Three unit great circles (XY, XZ, YZ): a wire sphere that stays light. */
export function wireSphere(): THREE.BufferGeometry {
  const points: number[] = []
  for (let index = 0; index < CIRCLE_SEGMENTS; index += 1) {
    const [a, b] = [(index / CIRCLE_SEGMENTS) * Math.PI * 2, ((index + 1) / CIRCLE_SEGMENTS) * Math.PI * 2]
    points.push(Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b), 0)
    points.push(Math.cos(a), 0, Math.sin(a), Math.cos(b), 0, Math.sin(b))
    points.push(0, Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b))
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
}

/** A wire cone with its apex at the origin and its axis along +Z: `length` deep, `radius` wide at its base. */
function wireCone(length: number, radius: number): THREE.BufferGeometry {
  const points: number[] = []
  const rim = (turn: number): [number, number, number] => [radius * Math.cos(turn * Math.PI * 2), radius * Math.sin(turn * Math.PI * 2), length]
  for (let index = 0; index < CIRCLE_SEGMENTS; index += 1) {
    points.push(...rim(index / CIRCLE_SEGMENTS), ...rim((index + 1) / CIRCLE_SEGMENTS))
  }
  for (let spoke = 0; spoke < CONE_SPOKES; spoke += 1) points.push(0, 0, 0, ...rim(spoke / CONE_SPOKES))
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
}

/** Frees the GPU resources of `object` and everything under it (a shared geometry is simply uploaded again on its next use). */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Sprite) {
      node.material.map?.dispose()
      node.material.dispose()
      return
    }
    if (!('geometry' in node && 'material' in node)) return
    if (node.geometry instanceof THREE.BufferGeometry) node.geometry.dispose()
    for (const material of [node.material].flat()) if (material instanceof THREE.Material) material.dispose()
  })
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
      disposeObject(object)
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
  const material = helper.material
  if (!(material instanceof THREE.LineBasicMaterial)) throw new Error('CameraHelper no longer draws with a LineBasicMaterial')
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

/** The fields of a Collider that decide its wire's geometry. */
interface WireShape {
  shape: Collider['shape']
  size: [number, number, number]
  radius: number
  height: number
}

const shapeOf = (collider: Collider): WireShape => ({ shape: collider.shape, size: [...collider.size], radius: collider.radius, height: collider.height })

/** True when `holder`'s wire was built for the Collider's current shape. */
function wireMatches(holder: THREE.Object3D, collider: Collider): boolean {
  const built = holder.userData.shape as WireShape | undefined
  return (
    built !== undefined &&
    built.shape === collider.shape &&
    built.radius === collider.radius &&
    built.height === collider.height &&
    built.size.every((value, axis) => value === collider.size[axis])
  )
}

/** Puts `cone` on the spot's world light and aims it along the world direction to its target, rebuilding its wire when its size changed. */
function fitCone(cone: THREE.LineSegments, spot: SpotLight, light: THREE.SpotLight): void {
  const length = spot.distance
  const radius = length * Math.tan(THREE.MathUtils.degToRad(spot.angle))
  const built = cone.userData.cone as { length: number; radius: number } | undefined
  if (built?.length !== length || built.radius !== radius) {
    cone.geometry.dispose()
    cone.geometry = wireCone(length, radius)
    cone.userData.cone = { length, radius }
  }
  light.getWorldPosition(cone.position)
  const axis = light.target.getWorldPosition(new THREE.Vector3()).sub(cone.position).normalize()
  cone.quaternion.setFromUnitVectors(CONE_AXIS, axis)
}

/** Each SpotLight's wire cone, rebuilt when its angle or distance change; like the range sphere, an unlimited spot (distance 0) has none (issue #204 inference I-4). */
function createSpotCones(game: Game) {
  const place = perComponent<SpotLight, THREE.LineSegments>(game, () => {
    const cone = new THREE.LineSegments(new THREE.BufferGeometry(), helperLineMaterial())
    cone.name = 'waica:editor-spot-cone'
    return cone
  })
  return (visible: boolean): void => {
    for (const { component, object } of place(liveComponents(game, SpotLight))) {
      const { light } = component
      object.visible = visible && component.distance > 0 && light !== null
      if (object.visible && light) fitCone(object, component, light)
    }
  }
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
      if (!wireMatches(object, component)) {
        for (const stale of object.children) disposeObject(stale)
        object.clear()
        object.add(colliderWire(component))
        object.userData.shape = shapeOf(component)
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
    const range = new THREE.LineSegments(sphere, helperLineMaterial())
    range.name = 'waica:editor-light-range'
    return range
  })
  const cones = createSpotCones(game)
  const colliders = createColliderWires(game)
  return {
    sync(live: ViewportLive, visible: boolean): void {
      frustum(live, visible)
      for (const { entity, component, object } of arrows(liveComponents(game, Sun))) {
        object.visible = visible
        entity.node.getWorldPosition(object.position)
        object.setDirection(new THREE.Vector3(...component.direction).normalize())
      }
      for (const { component, object } of ranges(liveComponents(game, PointLight))) {
        // A distance of 0 is unlimited: no ring to draw (issue #173 inference 16).
        object.visible = visible && component.distance > 0
        component.light?.getWorldPosition(object.position)
        object.scale.setScalar(component.distance)
      }
      cones(visible)
      colliders(visible)
    },
  }
}
