import { expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { createRangedSpotShadow } from './spot-shadow.js'

/** A spot at the origin shining down -Y, nine units of light and a 30° half-angle. */
function downwardSpot(): THREE.SpotLight {
  const light = new THREE.SpotLight(0xffcc88, 7, 9, THREE.MathUtils.degToRad(30), 0.2, 1.5)
  // Three places a new spot at (0, 1, 0).
  light.position.set(0, 0, 0)
  light.target.position.set(0, -1, 0)
  light.updateMatrixWorld()
  light.target.updateMatrixWorld()
  return light
}

/** Whether a world point falls inside the shadow camera's frustum, as the shadow node's frustum test sees it. */
function insideShadow(light: THREE.SpotLight, point: THREE.Vector3): boolean {
  const ndc = point.clone().project(light.shadow.camera)
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z >= -1 && ndc.z <= 1
}

it('limits the shadow camera to the range without shortening the nine-unit light', () => {
  const light = downwardSpot()
  const adapter = createRangedSpotShadow(light)
  adapter.sync(2)

  expect(light.shadow.camera.far).toBe(2)
  expect(light.shadow.camera.near).toBe(0.02)
  expect(light.shadow.camera.fov).toBeCloseTo(60, 9)
  expect(light.distance).toBe(9)
  expect(light.intensity).toBe(7)
  expect(light.decay).toBe(1.5)
  adapter.dispose()
})

it('shades a receiver 1.5 units along the axis and not one at 5 after three updates the shadow matrices', () => {
  const light = downwardSpot()
  const adapter = createRangedSpotShadow(light)
  adapter.sync(2)
  light.shadow.updateMatrices(light)

  expect(light.shadow.camera.far).toBe(2)
  expect(light.distance).toBe(9)
  expect(insideShadow(light, new THREE.Vector3(0, -1.5, 0))).toBe(true)
  expect(insideShadow(light, new THREE.Vector3(0, -5, 0))).toBe(false)
  expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true)
  adapter.dispose()
})

it('follows the latest cone angle and range on the next shadow update', () => {
  const light = downwardSpot()
  const adapter = createRangedSpotShadow(light)
  adapter.sync(2)
  light.angle = THREE.MathUtils.degToRad(45)
  adapter.sync(40)
  light.shadow.updateMatrices(light)

  expect(light.shadow.camera.fov).toBeCloseTo(90, 9)
  expect(light.shadow.camera.far).toBe(40)
  expect(light.shadow.camera.near).toBe(0.1)
  expect(light.distance).toBe(9)
  adapter.dispose()
})

it('restores the stock shadow update when disposed and ignores later synchronization', () => {
  const light = downwardSpot()
  const adapter = createRangedSpotShadow(light)
  adapter.sync(2)
  expect(Object.hasOwn(light.shadow, 'updateMatrices')).toBe(true)

  adapter.dispose()
  adapter.dispose()
  adapter.sync(100)

  expect(Object.hasOwn(light.shadow, 'updateMatrices')).toBe(false)
  expect(light.shadow.camera.far).toBe(2)
  // Three's own update is back: it reads far from the nine-unit light again.
  light.shadow.updateMatrices(light)
  expect(light.shadow.camera.far).toBe(9)
})

it('creates no proxy light and leaves the light and its target where they hang', () => {
  const parent = new THREE.Group()
  const light = downwardSpot()
  parent.add(light, light.target)
  const adapter = createRangedSpotShadow(light)
  adapter.sync(2)
  light.shadow.updateMatrices(light)

  expect(parent.children).toEqual([light, light.target])
  expect(light.children).toEqual([])
  adapter.dispose()
})
