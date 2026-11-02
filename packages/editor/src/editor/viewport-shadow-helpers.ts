// Read-only coverage of the single selected light in the 3D edit view (CA-14).
import { PointLight, SpotLight, Sun, THREE, type Game } from '@waica/engine'
import { disposeObject, HELPER_COLOR, helperLineMaterial, wireSphere } from './viewport-3d-helpers'
import { addOverlay } from './viewport-selection-gizmos'

type CoverageLight = Sun | PointLight | SpotLight

function selectedLight(game: Game, names: readonly string[]): CoverageLight | undefined {
  if (names.length !== 1) return undefined
  const name = names[0]
  const entity = name === undefined ? undefined : game.find(name)
  if (!entity?.alive) return undefined
  let light: CoverageLight | undefined
  for (const component of entity.components) {
    if (!(component instanceof Sun || component instanceof PointLight || component instanceof SpotLight)) continue
    if (light) return undefined
    light = component
  }
  return light
}

/** The wire of a shadow camera's volume, in the helpers' amber. */
function cameraCoverage(camera: THREE.Camera, name: string): THREE.CameraHelper {
  const helper = new THREE.CameraHelper(camera)
  const color = new THREE.Color(HELPER_COLOR)
  helper.setColors(color, color, color, color, color)
  if (helper.material instanceof THREE.LineBasicMaterial) {
    helper.material.transparent = true
    helper.material.opacity = 0.6
  }
  helper.name = name
  return helper
}

function createCoverage(component: CoverageLight): THREE.CameraHelper | THREE.LineSegments | null {
  if (component instanceof PointLight) {
    const object = new THREE.LineSegments(wireSphere(), helperLineMaterial())
    object.name = 'waica:editor-shadow-point'
    return object
  }
  const camera = component.light?.shadow.camera
  if (!camera) return null
  return cameraCoverage(camera, component instanceof Sun ? 'waica:editor-shadow-sun' : 'waica:editor-shadow-spot')
}

/** Only the current selection owns resources; the generic overlay sweep sees none after disposal. */
function shadowSlot(game: Game) {
  let current: { component: CoverageLight; object: THREE.CameraHelper | THREE.LineSegments } | undefined
  const dispose = (): void => {
    if (!current) return
    current.object.removeFromParent()
    disposeObject(current.object)
    current = undefined
  }
  return {
    dispose,
    select(component: CoverageLight | undefined): THREE.CameraHelper | THREE.LineSegments | null {
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
      if (!(component instanceof PointLight)) {
        // game.shadows fits the shadow camera now, from the same range and cone the next render draws.
        const camera = component instanceof Sun ? game.shadows.prepareSunCamera(component) : game.shadows.prepareSpotCamera(component)
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
