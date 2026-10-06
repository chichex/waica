// @vitest-environment happy-dom
import * as THREE from 'three'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { FakeTextureBackend, flush } from './assets/test-helpers.js'
import { loadScene } from './scene.js'
import { defined } from './test-support.js'
import {
  basic,
  drawnMeshes,
  instanceColor,
  linear,
  readyGame,
  materials,
  meshes,
  onlyRun,
  REGISTRY,
  renderFrame,
  runMeshes,
  scene,
  spriteEntity,
  spriteOf,
  useSpriteBatchTestEnvironment,
} from './test-sprite-batches.js'

useSpriteBatchTestEnvironment()

it('draws 100 sprites of one texture with one material in one run (CA-1)', async () => {
  const game = await readyGame()
  const entities = Array.from({ length: 100 }, (_, i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))
  loadScene(game, scene(entities), REGISTRY)
  await flush()
  renderFrame(game)

  expect(materials(game).size).toBe(1)
  expect(onlyRun(game).count).toBe(100)
  expect(basic(onlyRun(game).material).map).not.toBeNull()
  game.dispose()
})

it('tints one sprite through its instance color, never through a material (CA-1)', async () => {
  const game = await readyGame()
  loadScene(game, scene([0, 1, 2].map((i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))), REGISTRY)
  await flush()
  renderFrame(game)
  const before = materials(game)

  spriteOf(game, 'S1').color = 0xff0000
  renderFrame(game)

  expect(materials(game)).toEqual(before)
  expect(materials(game).size).toBe(1)
  const run = onlyRun(game)
  expect(instanceColor(run, 1)).toEqual(linear(0xff0000))
  expect(instanceColor(run, 0)).toEqual(linear(0xffffff))
  game.dispose()
})

it('shares the untextured entry of a shape across colors (CA-1)', async () => {
  const game = await readyGame()
  const entities = [
    spriteEntity('Red', { color: 0xff0000 }),
    spriteEntity('Blue', { color: 0x0000ff }),
    spriteEntity('Ball', { color: 0x00ff00, shape: 'circle' }),
    spriteEntity('Green', { color: 0x00ff00 }),
  ]
  loadScene(game, scene(entities), REGISTRY)
  await flush()
  renderFrame(game)

  // One untextured rectangle entry and one untextured circle entry.
  expect(materials(game).size).toBe(2)
  const runs = runMeshes(game)
  expect(runs.map((run) => run.count)).toEqual([2, 1, 1])
  expect(runs.map((run) => basic(run.material).map)).toEqual([null, null, null])
  expect(instanceColor(defined(runs[0]), 1)).toEqual(linear(0x0000ff))
  game.dispose()
})

it('moves the sprites of a failed texture to the untextured entry and leaves the others (CA-1)', async () => {
  const textures = new FakeTextureBackend()
  textures.failUrl('/broken.png')
  const game = await readyGame(textures)
  const entities = [
    spriteEntity('Fine', { texture: '/hero.png', layer: 0 }),
    spriteEntity('Broken', { texture: '/broken.png', color: 0x336699, layer: 1 }),
    spriteEntity('AlsoFine', { texture: '/hero.png', layer: 2 }),
  ]
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  loadScene(game, scene(entities), REGISTRY)
  await flush()
  renderFrame(game)

  const [fine, broken, alsoFine] = runMeshes(game)
  expect(basic(defined(fine).material).map).not.toBeNull()
  expect(defined(alsoFine).material).toBe(defined(fine).material)
  expect(basic(defined(broken).material).map).toBeNull()
  expect(instanceColor(defined(broken), 0)).toEqual(linear(0x336699))
  game.dispose()
})

it('restores one mesh and one material per sprite, with no batch objects, under render.batch: false (CA-6)', async () => {
  const game = await readyGame()
  const entities = Array.from({ length: 5 }, (_, i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))
  loadScene(game, scene(entities, { batch: false }), REGISTRY)
  await flush()
  renderFrame(game)

  expect(drawnMeshes(game)).toHaveLength(5)
  expect(materials(game).size).toBe(5)
  expect(meshes(game).some(({ mesh }) => mesh instanceof THREE.InstancedMesh)).toBe(false)
  game.dispose()
})

it('batches when the render block omits batch or sets it true (CA-6)', async () => {
  for (const render of [undefined, { batch: true }] as const) {
    const game = await readyGame()
    loadScene(game, scene([spriteEntity('A', {}), spriteEntity('B', {})], render), REGISTRY)
    await flush()
    renderFrame(game)
    expect(onlyRun(game).count).toBe(2)
    game.dispose()
  }
})
