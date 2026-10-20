// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
    await importOriginal<Record<string, unknown>>(),
  ),
)

import { loadScene, PointLight, Sun, THREE, type Game } from '@waica/engine'
import { ready3dGame, use3dTestEnvironment as install3dTestEnvironment } from '../../../engine/src/test-game-3d'
import { defined } from '../../../engine/src/test-support'
import { createShadowHelpers } from './viewport-shadow-helpers'

install3dTestEnvironment()

const owned: Array<{ game: Game; helpers: ReturnType<typeof createShadowHelpers> }> = []
afterEach(() => {
  for (const { game, helpers } of owned.splice(0)) {
    helpers.dispose()
    game.dispose()
  }
})

async function shadowView() {
  const { game } = await ready3dGame()
  loadScene(game, {
    waicaScene: 3,
    render: { space: '3d', shadows: { quality: 'medium', maxDistance: 12 } },
    camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60, near: 0.5, far: 80 },
    entities: [],
  }, { components: {} })
  const helpers = createShadowHelpers(game)
  owned.push({ game, helpers })
  return { game, helpers }
}

function coverageObjects(game: Game): THREE.Object3D[] {
  const objects: THREE.Object3D[] = []
  game.scene.traverse((object) => {
    if (object.name.startsWith('waica:editor-shadow-')) objects.push(object)
  })
  return objects
}

function observeCoverage(game: Game) {
  const object = defined(coverageObjects(game)[0])
  if (!(object instanceof THREE.LineSegments) || !(object.geometry instanceof THREE.BufferGeometry) || !(object.material instanceof THREE.LineBasicMaterial)) {
    throw new Error('expected native shadow coverage lines and material')
  }
  const geometryDisposed = vi.fn()
  const materialDisposed = vi.fn()
  object.geometry.addEventListener('dispose', geometryDisposed)
  object.material.addEventListener('dispose', materialDisposed)
  return { object, geometry: object.geometry, material: object.material, geometryDisposed, materialDisposed }
}

it('retains only the current coverage while selecting forty lights and reuses it on ordinary frames', async () => {
  const { game, helpers } = await shadowView()
  const selected: Array<ReturnType<typeof observeCoverage>> = []
  for (let index = 0; index < 40; index += 1) {
    const name = `Light ${index}`
    game.spawn(name).add<Sun | PointLight>(index % 2 === 0 ? Sun : PointLight)
    helpers.sync([name], true)
    const previous = selected.at(-1)
    if (previous) {
      expect(previous.geometryDisposed).toHaveBeenCalledTimes(1)
      expect(previous.materialDisposed).toHaveBeenCalledTimes(1)
      expect(previous.object.parent).toBeNull()
    }
    expect(coverageObjects(game)).toHaveLength(1)
    const current = observeCoverage(game)
    selected.push(current)
    for (let frame = 0; frame < 3; frame += 1) helpers.sync([name], true)
    expect(coverageObjects(game)).toEqual([current.object])
    expect(current.object.geometry).toBe(current.geometry)
    expect(current.object.material).toBe(current.material)
    expect(current.geometryDisposed).not.toHaveBeenCalled()
    expect(current.materialDisposed).not.toHaveBeenCalled()
  }
  helpers.dispose()
  helpers.dispose()
  expect(coverageObjects(game)).toHaveLength(0)
  for (const coverage of selected) {
    expect(coverage.geometryDisposed).toHaveBeenCalledTimes(1)
    expect(coverage.materialDisposed).toHaveBeenCalledTimes(1)
    expect(coverage.object.parent).toBeNull()
  }
})

it.each([{ Class: Sun, name: 'Sun' }, { Class: PointLight, name: 'PointLight' }])('creates no $name coverage while global shadows or the selected light are off', async ({ Class }) => {
  const { game, helpers } = await shadowView()
  const light = game.spawn('Light').add<Sun | PointLight>(Class)
  game.shadows.quality = 'off'

  helpers.sync(['Light'], true)

  expect(coverageObjects(game)).toHaveLength(0)
  game.shadows.quality = 'medium'
  light.castShadows = false
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(0)
  light.castShadows = true
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(1)
  const globalCoverage = observeCoverage(game)
  game.shadows.quality = 'off'
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(0)
  expect(globalCoverage.geometryDisposed).toHaveBeenCalledTimes(1)
  expect(globalCoverage.materialDisposed).toHaveBeenCalledTimes(1)
  game.shadows.quality = 'medium'
  helpers.sync(['Light'], true)
  const lightCoverage = observeCoverage(game)
  light.castShadows = false
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(0)
  expect(lightCoverage.geometryDisposed).toHaveBeenCalledTimes(1)
  expect(lightCoverage.materialDisposed).toHaveBeenCalledTimes(1)
})

it.each([
  { reason: 'the helpers toggle', names: ['Light'], visible: false },
  { reason: 'multi-selection', names: ['Light', 'Empty'], visible: true },
  { reason: 'empty selection', names: [], visible: true },
  { reason: 'a non-light selection', names: ['Empty'], visible: true },
  { reason: 'a missing selection', names: ['Missing'], visible: true },
])('retires current coverage for $reason and recreates only the next valid selection', async ({ names, visible }) => {
  const { game, helpers } = await shadowView()
  game.spawn('Light').add(PointLight)
  game.spawn('Empty')
  helpers.sync(['Light'], true)
  const previous = observeCoverage(game)

  helpers.sync(names, visible)
  helpers.sync(names, visible)

  expect(coverageObjects(game)).toHaveLength(0)
  expect(previous.object.parent).toBeNull()
  expect(previous.geometryDisposed).toHaveBeenCalledTimes(1)
  expect(previous.materialDisposed).toHaveBeenCalledTimes(1)
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(1)
  const next = observeCoverage(game)
  expect(next.object).not.toBe(previous.object)
  expect(next.geometry).not.toBe(previous.geometry)
  expect(next.material).not.toBe(previous.material)
})

it('replaces coverage when the selected entity keeps its name but its light component changes', async () => {
  const { game, helpers } = await shadowView()
  const entity = game.spawn('Light')
  const original = entity.add(Sun)
  helpers.sync(['Light'], true)
  const previous = observeCoverage(game)
  expect(previous.object.name).toBe('waica:editor-shadow-sun')

  original.onDestroy()
  entity.components.splice(entity.components.indexOf(original), 1)
  helpers.sync(['Light'], true)

  expect(entity.alive).toBe(true)
  expect(coverageObjects(game)).toHaveLength(0)
  expect(previous.geometryDisposed).toHaveBeenCalledTimes(1)
  expect(previous.materialDisposed).toHaveBeenCalledTimes(1)
  const replacement = entity.add(PointLight, { distance: 5, shadowMaxDistance: 3 })
  helpers.sync(['Light'], true)
  expect(coverageObjects(game)).toHaveLength(1)
  const next = observeCoverage(game)
  expect(next.object.name).toBe('waica:editor-shadow-point')
  expect(next.object.scale.toArray()).toEqual([3, 3, 3])
  expect(replacement.light?.distance).toBe(5)
})
