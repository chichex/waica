// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { loadScene, PointLight, Sun, THREE, type Game, type SceneJson } from '@waica/engine'
import { ready3dGame, use3dTestEnvironment as install3dTestEnvironment } from '../../../engine/src/test-game-3d'
import { renderFrame } from '../../../engine/src/test-sprite-batches'
import { defined } from '../../../engine/src/test-support'
import { createOverlays3d, type Overlays3d } from './viewport-3d-overlays'
import type { ViewportLive } from './viewport-live'

install3dTestEnvironment()

const SUN = 'waica:editor-shadow-sun'
const POINT = 'waica:editor-shadow-point'
const REGISTRY = { components: { Sun, PointLight } }
const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d', shadows: { quality: 'medium', maxDistance: 12 } },
  camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60, near: 0.5, far: 80 },
  entities: [
    { name: 'Daylight', position: [3, 5, 1], components: [{ type: 'Sun', props: { direction: [0, -3, 4] } }] },
    { name: 'Lamp', position: [2, 3, 4], components: [{ type: 'PointLight', props: { distance: 9, shadowMaxDistance: 2, offsetY: 1 } }] },
    { name: 'Glow', components: [{ type: 'PointLight', props: { distance: 0 } }] },
    { name: 'Empty' },
  ],
}

const owned: Array<{ game: Game; overlays: Overlays3d }> = []
afterEach(() => {
  for (const { game, overlays } of owned.splice(0)) {
    overlays.dispose()
    game.dispose()
  }
})

async function editView() {
  const { game } = await ready3dGame()
  loadScene(game, structuredClone(SCENE), REGISTRY)
  const live: ViewportLive = {
    scene: structuredClone(SCENE), registry: REGISTRY, selected: null, mode: 'edit',
    grid: { type: 'square', show: false, size: 1, snap: false },
    componentVisibility: { appearance: true, collision: true }, helpers3d: true,
  }
  const overlays = createOverlays3d(game)
  owned.push({ game, overlays })
  return { game, live, overlays }
}

function shadowObjects(game: Game, visibleOnly = true): THREE.Object3D[] {
  const found: THREE.Object3D[] = []
  const collect = (object: THREE.Object3D): void => {
    if (object.name.startsWith('waica:editor-shadow-')) found.push(object)
  }
  if (visibleOnly) game.scene.traverseVisible(collect)
  else game.scene.traverse(collect)
  return found
}

function pointWire(game: Game): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  return defined(shadowObjects(game).find((candidate): candidate is THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> =>
    candidate.name === POINT && candidate instanceof THREE.LineSegments && candidate.geometry instanceof THREE.BufferGeometry && candidate.material instanceof THREE.LineBasicMaterial,
  ), 'point shadow coverage lines')
}

function sunWire(game: Game): THREE.CameraHelper {
  const object = shadowObjects(game).find((candidate) => candidate.name === SUN)
  if (!(object instanceof THREE.CameraHelper)) throw new Error('expected Sun shadow camera coverage')
  return object
}

it('draws the selected PointLight’s effective Euclidean shadow radius without shortening its illumination (CA-14)', async () => {
  const { game, live, overlays } = await editView()
  overlays.update(live, true)
  expect(shadowObjects(game, false)).toHaveLength(0)

  live.selected = 'Lamp'
  overlays.update(live, true)

  const wire = pointWire(game)
  expect(shadowObjects(game).map((object) => object.name)).toEqual([POINT])
  expect(wire.position.toArray()).toEqual([2, 4, 4])
  expect(wire.scale.toArray()).toEqual([2, 2, 2])
  const vertices = wire.geometry.getAttribute('position')
  for (let index = 0; index < vertices.count; index += 1) {
    expect(new THREE.Vector3().fromBufferAttribute(vertices, index).length()).toBeCloseTo(1)
  }
  const lamp = defined(game.find('Lamp')).get(PointLight)
  expect(defined(lamp).light?.distance).toBe(9)
  expect(wire.material.color.getHex()).toBe(0xffc857)
})

it('draws the native Sun shadow volume fitted to the current active Editor Camera before any render (CA-14)', async () => {
  const { game, live, overlays } = await editView()
  const editor = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 80)
  editor.position.set(0, 0, 10)
  game.cameraRig.setViewCamera(editor)
  live.selected = 'Daylight'

  overlays.update(live, true)

  const sun = defined(defined(game.find('Daylight')).get(Sun))
  const light = defined(sun.light)
  const helper = sunWire(game)
  expect(shadowObjects(game).map((object) => object.name)).toEqual([SUN])
  expect(helper.camera).toBe(light.shadow.camera)
  expect(helper.matrix).toBe(light.shadow.camera.matrixWorld)
  expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048])
  for (const depth of [0.5, 12]) {
    for (const signX of [-1, 1]) for (const signY of [-1, 1]) {
      const point = new THREE.Vector3(signX * depth * Math.tan(Math.PI / 6) * 16 / 9, signY * depth * Math.tan(Math.PI / 6), 10 - depth)
      const projected = point.project(light.shadow.camera)
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(projected.z)).toBeLessThanOrEqual(1)
    }
  }
  expect(light.shadow.map).toBeNull()
  expect(editor.position.toArray()).toEqual([0, 0, 10])
  editor.near = 12
  editor.updateProjectionMatrix()
  overlays.update(live, true)
  expect(shadowObjects(game)).toHaveLength(0)
})

it('refreshes the Sun fit and wire in the host callback, not one frame after a parented camera or profile change (CA-14)', async () => {
  const { game, live, overlays } = await editView()
  const parent = new THREE.Group()
  const editor = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 80)
  parent.add(editor)
  editor.position.set(4, 6, 10)
  game.cameraRig.setViewCamera(editor)
  live.selected = 'Daylight'
  overlays.update(live, true)
  const helper = sunWire(game)
  const light = defined(defined(defined(game.find('Daylight')).get(Sun)).light)
  const before = helper.geometry.getAttribute('position').array.slice()
  parent.position.set(500, -20, 80)
  editor.rotation.set(0.2, 0.1, 0)
  editor.fov = 75
  editor.updateProjectionMatrix()
  game.shadows.quality = 'low'
  game.shadows.maxDistance = 5
  game.simulate = false
  let hostProjection: number[] = []
  game.onUpdate(() => {
    overlays.update(live, true)
    expect(light.target.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(480)
    expect(light.shadow.mapSize.toArray()).toEqual([1024, 1024])
    expect(helper.geometry.getAttribute('position').array).not.toEqual(before)
    const vertices = helper.geometry.getAttribute('position')
    expect(Math.max(...Array.from({ length: vertices.count }, (_, index) => vertices.getX(index)))).toBeCloseTo(light.shadow.camera.right, 4)
    hostProjection = light.shadow.camera.projectionMatrix.toArray()
  })

  renderFrame(game)

  expect(sunWire(game)).toBe(helper)
  expect(light.shadow.camera.projectionMatrix.toArray()).toEqual(hostProjection)
  expect(editor.position.toArray()).toEqual([4, 6, 10])
  expect(defined(game.find('Daylight')).node.position.toArray()).toEqual([3, 5, 1])
})

it('centers shadow and illumination ranges on the native emission point through rotated, scaled local offsets (CA-14)', async () => {
  const { game, live, overlays } = await editView()
  const entity = defined(game.find('Lamp'))
  const lamp = defined(entity.get(PointLight))
  lamp.offsetX = 1
  lamp.offsetY = 2
  lamp.offsetZ = 3
  entity.node.rotation.y = Math.PI / 2
  entity.node.scale.set(2, 3, 4)
  const parent = new THREE.Group()
  parent.position.set(10, -5, 3)
  parent.rotation.z = Math.PI / 2
  parent.scale.set(1, 2, 1)
  game.scene.add(parent)
  parent.add(entity.node)
  live.selected = 'Lamp'

  overlays.update(live, true)

  const wire = pointWire(game)
  expect(wire.position.x).toBeCloseTo(-8)
  expect(wire.position.y).toBeCloseTo(9)
  expect(wire.position.z).toBeCloseTo(5)
  expect(wire.scale.toArray()).toEqual([2, 2, 2])
  const range = defined(game.scene.getObjectByName('waica:editor-light-range'))
  expect(range.position.distanceTo(wire.position)).toBeLessThan(0.000001)
  expect(range.scale.toArray()).toEqual([9, 9, 9])
})

it.each(['Daylight', 'Lamp'])('disposes %s’s coverage once when its light is destroyed and forgets its pooled object', async (name) => {
  const { game, live, overlays } = await editView()
  live.selected = name
  overlays.update(live, true)
  const object = name === 'Daylight' ? sunWire(game) : pointWire(game)
  const geometryDisposed = vi.fn()
  const materialDisposed = vi.fn()
  object.geometry.addEventListener('dispose', geometryDisposed)
  const material = object.material
  if (Array.isArray(material)) throw new Error('expected a single coverage material')
  material.addEventListener('dispose', materialDisposed)

  defined(game.find(name)).destroy()
  overlays.update(live, true)
  expect(shadowObjects(game, false)).toHaveLength(0)
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  overlays.dispose()

  expect(shadowObjects(game, false)).toHaveLength(0)
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  expect(materialDisposed).toHaveBeenCalledTimes(1)
})

it.each(['Daylight', 'Lamp'])('allocates no %s coverage in Play, and frees edit resources on entering Play', async (name) => {
  const { game, live, overlays } = await editView()
  live.selected = name
  live.mode = 'play'
  overlays.update(live, true)
  expect(shadowObjects(game, false)).toHaveLength(0)
  live.mode = 'edit'
  overlays.update(live, true)
  const object = name === 'Daylight' ? sunWire(game) : pointWire(game)
  const disposed = vi.fn()
  object.geometry.addEventListener('dispose', disposed)

  live.mode = 'play'
  overlays.update(live, true)

  expect(shadowObjects(game, false)).toHaveLength(0)
  expect(disposed).toHaveBeenCalledTimes(1)
  overlays.dispose()
  expect(disposed).toHaveBeenCalledTimes(1)
})

it('shows coverage only for exactly one selected light, never for a multi-selection or another entity', async () => {
  const { game, live, overlays } = await editView()
  for (const selected of ['Daylight', 'Lamp', 'Empty', null]) {
    live.selected = selected
    overlays.update(live, true)
    expect(shadowObjects(game)).toHaveLength(selected === 'Daylight' || selected === 'Lamp' ? 1 : 0)
  }
  live.selected = 'Lamp'
  live.multiSelected = ['Lamp', 'Daylight']
  overlays.update(live, true)
  expect(shadowObjects(game)).toHaveLength(0)
  live.multiSelected = ['Lamp', 'Empty']
  overlays.update(live, true)
  expect(shadowObjects(game)).toHaveLength(0)

  const mixed = game.spawn('Mixed')
  mixed.add(Sun)
  mixed.add(PointLight)
  live.selected = 'Mixed'
  live.multiSelected = []
  overlays.update(live, true)
  expect(shadowObjects(game)).toHaveLength(0)
})

it('resolves a finite PointLight radius live for unlimited illumination, inheritance and changing distances', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Glow'
  const lamp = defined(defined(game.find('Glow')).get(PointLight))
  overlays.update(live, true)
  const wire = pointWire(game)
  expect(wire.scale.toArray()).toEqual([12, 12, 12])
  game.shadows.maxDistance = 5
  game.shadows.quality = 'low'
  overlays.update(live, true)
  expect(pointWire(game)).toBe(wire)
  expect(wire.scale.toArray()).toEqual([5, 5, 5])
  lamp.shadowMaxDistance = 3
  lamp.distance = 9
  overlays.update(live, true)
  expect(wire.scale.toArray()).toEqual([3, 3, 3])
  lamp.distance = 1.5
  overlays.update(live, true)
  expect(wire.scale.toArray()).toEqual([1.5, 1.5, 1.5])
  lamp.shadowMaxDistance = null
  lamp.distance = 0
  overlays.update(live, true)
  expect(wire.scale.toArray()).toEqual([5, 5, 5])
})

it('adds no picking targets or shadow maps and never changes authored light flags when selection changes', async () => {
  const { game, live, overlays } = await editView()
  overlays.update(live, true)
  const targets = overlays.targets().map(({ object }) => object.uuid)
  const lights = [defined(defined(game.find('Daylight')).get(Sun)), defined(defined(game.find('Lamp')).get(PointLight))]
  const authored = lights.map((component) => [component.castShadows, component.shadowMapSize, component.shadowMaxDistance, component.shadowBias])
  for (const selected of ['Daylight', 'Lamp', 'Empty']) {
    live.selected = selected
    overlays.update(live, true)
    expect(overlays.targets().map(({ object }) => object.uuid)).toEqual(targets)
    expect(lights.map((component) => [component.castShadows, component.shadowMapSize, component.shadowMaxDistance, component.shadowBias])).toEqual(authored)
    expect(lights.map((component) => component.light?.castShadow)).toEqual([false, false])
    expect(lights.map((component) => component.light?.shadow.map)).toEqual([null, null])
  }
})

it('clears coverage resources and registries across inactive views and scene swaps', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Daylight'
  for (let cycle = 0; cycle < 10; cycle += 1) {
    overlays.update(live, true)
    expect(shadowObjects(game, false)).toHaveLength(1)
    const disposed = vi.fn()
    sunWire(game).geometry.addEventListener('dispose', disposed)
    if (cycle % 2 === 0) overlays.update(live, false)
    else {
      loadScene(game, { waicaScene: 3, entities: [] }, REGISTRY)
      overlays.update(live, true)
    }
    expect(shadowObjects(game, false)).toHaveLength(0)
    expect(disposed).toHaveBeenCalledTimes(1)
    loadScene(game, structuredClone(SCENE), REGISTRY)
  }
})
