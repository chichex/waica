// Read-only coverage of the single selected light in the 3D edit view (CA-14).
import { PointLight, Sun, THREE, type Game } from '@waica/engine'
import { disposeObject, HELPER_COLOR, wireSphere } from './viewport-3d-helpers'
import { addOverlay } from './viewport-selection-gizmos'

function selectedLight(game: Game, names: readonly string[]): Sun | PointLight | undefined {
  if (names.length !== 1) return undefined
  const name = names[0]
  const entity = name === undefined ? undefined : game.find(name)
  if (!entity?.alive) return undefined
  let light: Sun | PointLight | undefined
  for (const component of entity.components) {
    if (!(component instanceof Sun || component instanceof PointLight)) continue
    if (light) return undefined
    light = component
  }
  return light
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

/** Only the current selection owns resources; the generic overlay sweep sees none after disposal. */
function shadowSlot(game: Game) {
  let current: { component: Sun | PointLight; object: THREE.CameraHelper | THREE.LineSegments } | undefined
  const dispose = (): void => {
    if (!current) return
    current.object.removeFromParent()
    disposeObject(current.object)
    current = undefined
  }
  return {
    dispose,
    select(component: Sun | PointLight | undefined): THREE.CameraHelper | THREE.LineSegments | null {
      if (current && (current.component !== component || !current.component.entity.alive || !current.component.entity.components.includes(current.component))) dispose()
      if (!component) return null
      if (current) return current.object
      const object = createCoverage(component)
      if (object) {
        addOverlay(game, object)
        current = { component, object }
      }
      return object
    },
  }
}

export function createShadowHelpers(game: Game) {
  const slot = shadowSlot(game)
  return {
    dispose: slot.dispose,
    sync(names: readonly string[], visible: boolean): void {
      const component = visible ? selectedLight(game, names) : undefined
      if (!component?.light) {
        slot.dispose()
        return
      }
      if (component instanceof Sun) {
        const camera = game.shadows.prepareSunCamera(component)
        const object = slot.select(camera ? component : undefined)
        if (object instanceof THREE.CameraHelper) {
          object.update()
          object.visible = true
        }
        return
      }
      const settings = game.shadows.resolve(component)
      const object = slot.select(settings.enabled ? component : undefined)
      if (!object) return
      component.light.getWorldPosition(object.position)
      object.scale.setScalar(settings.maxDistance)
      object.visible = true
    },
  }
}
