// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { loadScene, SpotLight, Sun, THREE, type Game, type SceneJson } from '@waica/engine'
import { ready3dGame, use3dTestEnvironment as install3dTestEnvironment } from '../../../engine/src/test-game-3d'
import { renderFrame } from '../../../engine/src/test-sprite-batches'
import { defined } from '../../../engine/src/test-support'
import { createOverlays3d, type Overlays3d } from './viewport-3d-overlays'
import type { ViewportLive } from './viewport-live'

install3dTestEnvironment()

const SPOT = 'waica:editor-shadow-spot'
const REGISTRY = { components: { Sun, SpotLight } }
const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d', shadows: { quality: 'medium', maxDistance: 12 } },
  camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60, near: 0.5, far: 80 },
  entities: [
    { name: 'Daylight', position: [3, 5, 1], components: [{ type: 'Sun' }] },
    { name: 'Beam', position: [2, 5, 1], components: [{ type: 'SpotLight', props: { distance: 9, shadowMaxDistance: 2, angle: 30 } }] },
    { name: 'Other', position: [-2, 5, 1], components: [{ type: 'SpotLight', props: { distance: 4 } }] },
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

function coverageObjects(game: Game, visibleOnly = true): THREE.Object3D[] {
  const found: THREE.Object3D[] = []
  const collect = (object: THREE.Object3D): void => {
    if (object.name.startsWith('waica:editor-shadow-')) found.push(object)
  }
  if (visibleOnly) game.scene.traverseVisible(collect)
  else game.scene.traverse(collect)
  return found
}

function spotCoverage(game: Game): THREE.CameraHelper {
  const object = coverageObjects(game).find((candidate) => candidate.name === SPOT)
  if (!(object instanceof THREE.CameraHelper)) throw new Error('expected the spot shadow camera coverage')
  return object
}

const spotOf = (game: Game, name: string): SpotLight => defined(defined(game.find(name)).get(SpotLight))

/** The local extent of the helper's wire: how far its far plane lies and how wide it opens there. */
function volumeOf(helper: THREE.CameraHelper): { depth: number; halfWidth: number } {
  const positions = helper.geometry.getAttribute('position')
  const points = Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index))
  return { depth: Math.max(...points.map((point) => -point.z)), halfWidth: Math.max(...points.map((point) => point.x)) }
}

it('draws the selected spot’s shadow camera volume once game.shadows synced it, as the Sun does (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Beam'
  renderFrame(game)

  overlays.update(live, true)

  const beam = spotOf(game, 'Beam')
  const helper = spotCoverage(game)
  expect(coverageObjects(game).map((object) => object.name)).toEqual([SPOT])
  expect(helper.camera).toBe(defined(beam.light).shadow.camera)
  expect(helper.matrix).toBe(defined(beam.light).shadow.camera.matrixWorld)
  // The coverage is the spot's shadow range (2), not its light distance (9), opened by the cone's 2 x 30 degrees.
  const { depth, halfWidth } = volumeOf(helper)
  expect(depth).toBeCloseTo(2, 4)
  expect(halfWidth).toBeCloseTo(2 * Math.tan(Math.PI / 6), 4)
  expect(beam.light?.distance).toBe(9)
  // Every segment takes the helpers' amber from its vertex colors, like the Sun's coverage.
  const colors = helper.geometry.getAttribute('color')
  expect(new Set(Array.from({ length: colors.count }, (_, index) => new THREE.Color().fromBufferAttribute(colors, index).getHex()))).toEqual(new Set([0xffc857]))
  const { material } = helper
  if (!(material instanceof THREE.LineBasicMaterial)) throw new Error('expected the coverage to use a LineBasicMaterial')
  expect([material.transparent, material.opacity]).toEqual([true, 0.6])
})

it('follows a cone angle and shadow range change in the same frame, before any render (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Beam'
  overlays.update(live, true)
  const helper = spotCoverage(game)
  expect(volumeOf(helper).depth).toBeCloseTo(2, 4)

  const beam = spotOf(game, 'Beam')
  beam.angle = 45
  beam.shadowMaxDistance = 5
  overlays.update(live, true)

  expect(spotCoverage(game)).toBe(helper)
  const { depth, halfWidth } = volumeOf(helper)
  expect(depth).toBeCloseTo(5, 4)
  expect(halfWidth).toBeCloseTo(5, 4)
})

it('shows no spot coverage when shadows are off, globally or for the light (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Beam'
  renderFrame(game)
  overlays.update(live, true)
  expect(coverageObjects(game)).toHaveLength(1)

  game.shadows.quality = 'off'
  overlays.update(live, true)
  expect(coverageObjects(game, false)).toHaveLength(0)

  game.shadows.quality = 'medium'
  spotOf(game, 'Beam').castShadows = false
  overlays.update(live, true)
  expect(coverageObjects(game, false)).toHaveLength(0)

  spotOf(game, 'Beam').castShadows = true
  overlays.update(live, true)
  expect(coverageObjects(game)).toHaveLength(1)
})

it('shows spot coverage only for exactly one selected spot, never for another entity or a multi-selection (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  renderFrame(game)
  for (const selected of ['Beam', 'Other', 'Empty', null]) {
    live.selected = selected
    overlays.update(live, true)
    expect(coverageObjects(game).map((object) => object.name), String(selected)).toEqual(selected === 'Beam' || selected === 'Other' ? [SPOT] : [])
  }
  live.selected = 'Beam'
  live.multiSelected = ['Beam', 'Other']
  overlays.update(live, true)
  expect(coverageObjects(game)).toHaveLength(0)
  live.multiSelected = ['Beam', 'Empty']
  overlays.update(live, true)
  expect(coverageObjects(game)).toHaveLength(0)

  const mixed = game.spawn('Mixed')
  mixed.add(Sun)
  mixed.add(SpotLight)
  live.selected = 'Mixed'
  live.multiSelected = []
  overlays.update(live, true)
  expect(coverageObjects(game)).toHaveLength(0)
})

it('disposes the spot coverage once when its light is destroyed, and again frees nothing on dispose (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Beam'
  renderFrame(game)
  overlays.update(live, true)
  const helper = spotCoverage(game)
  const geometryDisposed = vi.fn()
  const materialDisposed = vi.fn()
  helper.geometry.addEventListener('dispose', geometryDisposed)
  if (Array.isArray(helper.material)) throw new Error('expected a single coverage material')
  helper.material.addEventListener('dispose', materialDisposed)

  defined(game.find('Beam')).destroy()
  overlays.update(live, true)
  expect(coverageObjects(game, false)).toHaveLength(0)
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  overlays.dispose()

  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  expect(materialDisposed).toHaveBeenCalledTimes(1)
})

it('allocates no spot coverage in Play, and frees it on entering Play (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  live.selected = 'Beam'
  renderFrame(game)
  live.mode = 'play'
  overlays.update(live, true)
  expect(coverageObjects(game, false)).toHaveLength(0)
  live.mode = 'edit'
  overlays.update(live, true)
  const disposed = vi.fn()
  spotCoverage(game).geometry.addEventListener('dispose', disposed)

  live.mode = 'play'
  overlays.update(live, true)

  expect(coverageObjects(game, false)).toHaveLength(0)
  expect(disposed).toHaveBeenCalledTimes(1)
})

it('adds no picking targets for the spot cone or its coverage, and leaves the authored light untouched (CA-12)', async () => {
  const { game, live, overlays } = await editView()
  renderFrame(game)
  overlays.update(live, true)
  const targets = overlays.targets().map(({ object }) => object.uuid)
  const beam = spotOf(game, 'Beam')
  const authored = [beam.castShadows, beam.shadowMapSize, beam.shadowMaxDistance, beam.distance, beam.angle]

  live.selected = 'Beam'
  overlays.update(live, true)

  expect(coverageObjects(game).map((object) => object.name)).toEqual([SPOT])
  expect(game.scene.getObjectByName('waica:editor-spot-cone')?.visible).toBe(true)
  expect(overlays.targets().map(({ object }) => object.uuid)).toEqual(targets)
  expect(overlays.targets().every(({ object }) => object.name === 'waica:editor-icon')).toBe(true)
  expect([beam.castShadows, beam.shadowMapSize, beam.shadowMaxDistance, beam.distance, beam.angle]).toEqual(authored)
})
