import * as THREE from 'three/webgpu'

export interface RangedSpotShadow {
  /** Call before rendering, with the resolved finite, positive shadow range (already capped by the light's distance). */
  sync(maxDistance: number): void
  /** Restores Three's stock shadow update. */
  dispose(): void
}

type UpdateMatrices = THREE.SpotLightShadow['updateMatrices']

/**
 * Keeps the shadow camera independent of the real light's attenuation.
 * Three's stock spot shadow rewrites `far` from `light.distance` on every
 * update, so an instance-own `updateMatrices` replaces only that step: the fov
 * still covers the cone (`2·angle·focus`), `far` is the shadow range and the
 * light keeps its distance. Receivers beyond `far` fail the shadow node's
 * frustum test, so the limit is depth along the cone's axis, not a radius.
 */
export function createRangedSpotShadow(light: THREE.SpotLight): RangedSpotShadow {
  const shadow = light.shadow
  const camera = shadow.camera
  let range = camera.far
  let disposed = false

  const fit = (): void => {
    const fov = THREE.MathUtils.RAD2DEG * 2 * light.angle * shadow.focus
    const aspect = (shadow.mapSize.width / shadow.mapSize.height) * shadow.aspect
    const near = Math.min(0.1, range / 100)
    if (fov === camera.fov && aspect === camera.aspect && near === camera.near && range === camera.far) return
    camera.fov = fov
    camera.aspect = aspect
    camera.near = near
    camera.far = range
    camera.updateProjectionMatrix()
  }
  const updateMatrices: UpdateMatrices = (target) => {
    fit()
    THREE.LightShadow.prototype.updateMatrices.call(shadow, target)
  }
  shadow.updateMatrices = updateMatrices

  return {
    sync(maxDistance) {
      if (disposed) return
      range = maxDistance
      fit()
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (shadow.updateMatrices === updateMatrices) Reflect.deleteProperty(shadow, 'updateMatrices')
    },
  }
}
