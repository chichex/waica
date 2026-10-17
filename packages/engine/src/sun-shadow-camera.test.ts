import * as THREE from 'three/webgpu'
import { expect, it } from 'vitest'
import type { ResolvedLightShadow } from './scene-shadows.js'
import { fitSunShadow } from './sun-shadow-camera.js'

const settings: Readonly<ResolvedLightShadow> = Object.freeze({
  enabled: true, mapSize: 1024, maxDistance: 10, bias: 0, normalBias: 0, radius: 1,
})

function view(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(90, 2, 1, 80)
  camera.position.set(1000, 200, -300)
  camera.updateMatrixWorld()
  return camera
}

/** Analytic perspective corners, independent of the fitting algorithm. */
function receivers(camera: THREE.PerspectiveCamera, far: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (const depth of [camera.near, far]) {
    const height = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth / camera.zoom
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        points.push(new THREE.Vector3(x * height * camera.aspect, y * height, -depth).applyMatrix4(camera.matrixWorld))
      }
    }
  }
  return points
}

function expectCovered(light: THREE.DirectionalLight, points: THREE.Vector3[], margin = 0): void {
  for (const point of points) {
    const uv = point.clone().applyMatrix4(light.shadow.matrix)
    expect(uv.x).toBeGreaterThanOrEqual(margin - 1e-10)
    expect(uv.x).toBeLessThanOrEqual(1 - margin + 1e-10)
    expect(uv.y).toBeGreaterThanOrEqual(margin - 1e-10)
    expect(uv.y).toBeLessThanOrEqual(1 - margin + 1e-10)
    expect(uv.z).toBeGreaterThanOrEqual(-1e-10)
    expect(uv.z).toBeLessThanOrEqual(1 + 1e-10)
  }
}

function cameraState(camera: THREE.PerspectiveCamera): unknown[] {
  return [camera.toJSON(), camera.matrixWorld.toArray(), camera.matrixWorldInverse.toArray(), camera.projectionMatrixInverse.toArray()]
}

it('covers near-to-range receivers far from the world origin without changing Sun direction', () => {
  const camera = view()
  const light = new THREE.DirectionalLight()
  const direction = [-1, -2, -1] as const
  expect(fitSunShadow({ light, camera, settings, direction })).toBe(true)
  expectCovered(light, receivers(camera, 10))
  const travel = light.target.getWorldPosition(new THREE.Vector3()).sub(light.getWorldPosition(new THREE.Vector3())).normalize()
  expect(travel.distanceTo(new THREE.Vector3(...direction).normalize())).toBeLessThan(1e-12)
})

it('includes an offscreen caster a full shadow range toward the source from a visible receiver', () => {
  const camera = view()
  camera.fov = 30
  camera.aspect = 1
  camera.updateProjectionMatrix()
  const light = new THREE.DirectionalLight()
  const receiver = new THREE.Vector3(0, 0, -1).applyMatrix4(camera.matrixWorld)
  const caster = receiver.clone().add(new THREE.Vector3(0, 0, 10))
  expect(caster.clone().applyMatrix4(camera.matrixWorldInverse).z).toBeGreaterThan(0)
  fitSunShadow({ light, camera, settings, direction: [0, 0, -1] })
  expectCovered(light, [...receivers(camera, 10), caster])
  const receiverUv = receiver.clone().applyMatrix4(light.shadow.matrix)
  const casterUv = caster.clone().applyMatrix4(light.shadow.matrix)
  expect(casterUv.x).toBeCloseTo(receiverUv.x, 12)
  expect(casterUv.y).toBeCloseTo(receiverUv.y, 12)
  expect(casterUv.z).toBeLessThan(receiverUv.z)
})

it('keeps world-to-shadow UV terms fixed for subtexel motion and extent fixed under camera rotation', () => {
  const camera = view()
  camera.position.set(0, 0, 5.5)
  camera.updateMatrixWorld()
  const light = new THREE.DirectionalLight()
  const direction = [0, 0, -1] as const
  fitSunShadow({ light, camera, settings, direction })
  const before = light.shadow.matrix.clone().elements
  const width = light.shadow.camera.right - light.shadow.camera.left
  camera.position.x += width / settings.mapSize * 0.2
  camera.updateMatrixWorld()
  fitSunShadow({ light, camera, settings, direction })
  for (const index of [0, 1, 4, 5, 8, 9, 12, 13]) {
    expect(light.shadow.matrix.elements[index]).toBeCloseTo(before[index] ?? NaN, 12)
  }
  camera.rotation.set(0.4, -0.6, 0.1)
  camera.updateMatrixWorld()
  fitSunShadow({ light, camera, settings, direction })
  expect(light.shadow.camera.right - light.shadow.camera.left).toBeCloseTo(width, 12)
  expectCovered(light, receivers(camera, 10))
})

it('reserves at least one XY texel around receivers even at a snapping boundary', () => {
  const camera = view()
  camera.aspect = 1
  camera.position.set(0, 0, 5.5)
  camera.rotation.z = Math.PI / 4
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const light = new THREE.DirectionalLight()
  // The far corner (sqrt(200), 0, -4.5) is perpendicular to this Sun.
  const direction = [4.5, 0, Math.sqrt(200)] as const
  fitSunShadow({ light, camera, settings, direction })
  expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
  const texel = (light.shadow.camera.right - light.shadow.camera.left) / settings.mapSize
  const right = new THREE.Vector3().setFromMatrixColumn(light.shadow.camera.matrixWorld, 0)
  camera.position.addScaledVector(right, texel * 0.49)
  camera.updateMatrixWorld()
  fitSunShadow({ light, camera, settings, direction })
  expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
})

it('uses a deterministic finite basis for vertical and nearly vertical Sun directions', () => {
  const camera = view()
  const light = new THREE.DirectionalLight()
  const directions = [[0, -1, 0], [1e-12, -1, 0], [0, 1, 0]] as const
  for (const direction of directions) {
    fitSunShadow({ light, camera, settings, direction })
    const travel = light.shadow.camera.getWorldDirection(new THREE.Vector3())
    expect(travel.distanceTo(new THREE.Vector3(...direction).normalize())).toBeLessThan(1e-12)
    expect(light.shadow.matrix.elements.every(Number.isFinite)).toBe(true)
    expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
    const matrix = light.shadow.matrix.toArray()
    light.shadow.camera.up.set(1, 0, 0)
    fitSunShadow({ light, camera, settings, direction })
    expect(light.shadow.matrix.toArray()).toEqual(matrix)
  }
})

it('reports empty near/far intervals without changing the last valid fit or allocating maps', () => {
  const camera = view()
  const light = new THREE.DirectionalLight()
  const direction = [0, -1, 0] as const
  fitSunShadow({ light, camera, settings, direction })
  const matrix = light.shadow.matrix.toArray()
  for (const [maxDistance, far] of [[0.5, 80], [1, 80], [10, 1]] as const) {
    camera.far = far
    expect(fitSunShadow({ light, camera, settings: { ...settings, maxDistance }, direction })).toBe(false)
    expect(light.shadow.matrix.toArray()).toEqual(matrix)
    expect(light.shadow.camera.near).toBeGreaterThan(0)
    expect(light.shadow.matrix.elements.every(Number.isFinite)).toBe(true)
    expect(light.shadow.map).toBeNull()
  }
})

it('leaves light placement, camera and shadow resources untouched when shadows are disabled', () => {
  const camera = view()
  const light = new THREE.DirectionalLight()
  const before = light.toJSON()
  const cameraBefore = camera.toJSON()
  const disabled = Object.freeze({ ...settings, enabled: false, mapSize: 4096 })
  expect(fitSunShadow({ light, camera, settings: disabled, direction: [-1, -2, -1] })).toBe(false)
  expect(light.toJSON()).toEqual(before)
  expect(camera.toJSON()).toEqual(cameraBefore)
  expect(light.shadow.map).toBeNull()
})

it('refits parented, resized, rotated and teleported views with current map size and depth limits', () => {
  const camera = view()
  const parent = new THREE.Group()
  parent.add(camera)
  parent.scale.setScalar(2)
  camera.zoom = 1.5
  camera.near = 0.25
  const light = new THREE.DirectionalLight()
  const cases = [
    { mapSize: 256, maxDistance: 10, far: 80, aspect: 2, depth: 10 },
    { mapSize: 4096, maxDistance: 40, far: 6, aspect: 3, depth: 6 },
    { mapSize: 1024, maxDistance: 2, far: 80, aspect: 0.5, depth: 2 },
  ]
  for (const state of cases) {
    camera.aspect = state.aspect
    camera.far = state.far
    camera.rotation.x += 0.2
    camera.updateProjectionMatrix()
    parent.position.x += 4000
    parent.rotation.y += 0.6
    parent.updateMatrixWorld(true)
    const before = cameraState(camera)
    expect(fitSunShadow({ light, camera, settings: { ...settings, ...state }, direction: [-1, -2, -1] })).toBe(true)
    expect(light.shadow.mapSize.toArray()).toEqual([state.mapSize, state.mapSize])
    expectCovered(light, receivers(camera, state.depth), 1 / state.mapSize)
    expect(cameraState(camera)).toEqual(before)
    expect(light.shadow.map).toBeNull()
  }
})

it('fits the same optical frustum with WebGL and WebGPU near-plane NDC conventions', () => {
  const camera = view()
  camera.near = 9
  const light = new THREE.DirectionalLight()
  let width: number | undefined
  for (const coordinateSystem of [THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem]) {
    camera.coordinateSystem = coordinateSystem
    camera.updateProjectionMatrix()
    light.shadow.camera.coordinateSystem = coordinateSystem
    fitSunShadow({ light, camera, settings, direction: [-1, -2, -1] })
    const current = light.shadow.camera.right - light.shadow.camera.left
    if (width !== undefined) expect(current).toBeCloseTo(width, 10)
    width = current
    expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
    expect(light.shadow.matrix.elements.every(Number.isFinite)).toBe(true)
  }
})

it('keeps tiny valid intervals finite and rejects unusable perspective near planes', () => {
  const camera = view()
  camera.near = 0.009999
  camera.far = 0.02
  camera.updateProjectionMatrix()
  const light = new THREE.DirectionalLight()
  const options = { light, camera, settings: { ...settings, maxDistance: 0.01 }, direction: [0, -1, 0] as const }
  expect(fitSunShadow(options)).toBe(true)
  expectCovered(light, receivers(camera, 0.01))
  expect(Number.isFinite(light.shadow.camera.near)).toBe(true)
  expect(light.shadow.camera.far).toBeGreaterThan(light.shadow.camera.near)
  const matrix = light.shadow.matrix.toArray()
  for (const near of [0, NaN, Infinity]) {
    camera.near = near
    expect(fitSunShadow(options)).toBe(false)
    expect(light.shadow.matrix.toArray()).toEqual(matrix)
  }
})

it('contains a camera frustum sheared by a rotated camera under a nonuniformly scaled parent', () => {
  const camera = view()
  camera.position.set(0, 0, 0)
  camera.aspect = 1
  camera.rotation.z = Math.PI / 4
  camera.updateProjectionMatrix()
  const parent = new THREE.Group()
  parent.scale.set(10, 1, 1)
  parent.add(camera)
  parent.updateMatrixWorld(true)
  const before = cameraState(camera)
  const light = new THREE.DirectionalLight()
  fitSunShadow({ light, camera, settings, direction: [0, 0, -1] })
  expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
  expect(cameraState(camera)).toEqual(before)
})

it('keeps fitting and Sun direction in world space when the light and target are parented', () => {
  const camera = view()
  const light = new THREE.DirectionalLight()
  const parent = new THREE.Group()
  parent.position.set(-500, 30, 250)
  parent.rotation.y = 0.6
  parent.scale.set(2, 3, 4)
  parent.add(light, light.target)
  parent.updateMatrixWorld(true)
  const direction = [-1, -2, -1] as const
  fitSunShadow({ light, camera, settings, direction })
  expectCovered(light, receivers(camera, 10), 1 / settings.mapSize)
  const travel = light.target.getWorldPosition(new THREE.Vector3()).sub(light.getWorldPosition(new THREE.Vector3())).normalize()
  expect(travel.distanceTo(new THREE.Vector3(...direction).normalize())).toBeLessThan(1e-12)
})
