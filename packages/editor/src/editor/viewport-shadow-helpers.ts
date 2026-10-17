// Read-only coverage of the single selected light in the 3D edit view (CA-14).
import { PointLight, Sun, THREE, type Game, type ResolvedLightShadow } from '@waica/engine'
import { disposeObject, HELPER_COLOR, wireSphere } from './viewport-3d-helpers'
import { addOverlay } from './viewport-selection-gizmos'

function selectedLight(game: Game, names: readonly string[]): Sun | PointLight | undefined {
  if (names.length !== 1) return undefined
  const name = names[0]
  const entity = name === undefined ? undefined : game.find(name)
  if (!entity?.alive) return undefined
  const lights = entity.components.filter((component) => component instanceof Sun || component instanceof PointLight)
  return lights.length === 1 ? lights[0] : undefined
}

function sunCoverage(light: THREE.DirectionalLight): THREE.CameraHelper {
  const helper = new THREE.CameraHelper(light.shadow.camera)
  const color = new THREE.Color(HELPER_COLOR)
  helper.setColors(color, color, color, color, color)
  if (helper.material instanceof THREE.LineBasicMaterial) {
    helper.material.transparent = true
    helper.material.opacity = 0.6
  }
  helper.name = 'waica:editor-shadow-sun'
  return helper
}

function createCoverage(component: Sun | PointLight): THREE.CameraHelper | THREE.LineSegments | null {
  if (component instanceof Sun) return component.light ? sunCoverage(component.light) : null
  const object = new THREE.LineSegments(wireSphere(), new THREE.LineBasicMaterial({ color: HELPER_COLOR, transparent: true, opacity: 0.6 }))
  object.name = 'waica:editor-shadow-point'
  return object
}

/** The same resolver and Sun fit as the render boundary, prepared for this frame. */
function prepareCoverage(game: Game, component: Sun | PointLight): ResolvedLightShadow | null {
  const settings = game.shadows.resolve(component)
  if (!settings.enabled) return null
  if (component instanceof Sun && !game.shadows.prepareSunCamera(component)) return null
  return settings
}

/** Only coverage objects own these resources; the generic overlay sweep sees none after disposal. */
function shadowPool(game: Game) {
  const objects = new Map<Sun | PointLight, THREE.CameraHelper | THREE.LineSegments>()
  const remove = (component: Sun | PointLight): void => {
    const object = objects.get(component)
    object?.removeFromParent()
    if (object) disposeObject(object)
    objects.delete(component)
  }
  return {
    objects,
    ensure(component: Sun | PointLight): THREE.CameraHelper | THREE.LineSegments | null {
      const existing = objects.get(component)
      if (existing) return existing
      const object = createCoverage(component)
      if (object) {
        addOverlay(game, object)
        objects.set(component, object)
      }
      return object
    },
    prune(): void {
      const present = new Set(game.entities.filter((entity) => entity.alive).flatMap((entity) => entity.components))
      for (const component of objects.keys()) if (!present.has(component)) remove(component)
    },
    dispose: (): void => {
      for (const component of objects.keys()) remove(component)
    },
  }
}

export function createShadowHelpers(game: Game) {
  const pool = shadowPool(game)
  const { objects } = pool
  return {
    dispose: pool.dispose,
    sync(names: readonly string[], visible: boolean): void {
      pool.prune()
      for (const object of objects.values()) object.visible = false
      if (!visible) return
      const component = selectedLight(game, names)
      if (!component?.light) return
      const settings = prepareCoverage(game, component)
      if (!settings) return
      const object = pool.ensure(component)
      if (!object) return
      if (component instanceof PointLight) {
        component.light.getWorldPosition(object.position)
        object.scale.setScalar(settings.maxDistance)
      }
      if (object instanceof THREE.CameraHelper) object.update()
      object.visible = true
    },
  }
}
