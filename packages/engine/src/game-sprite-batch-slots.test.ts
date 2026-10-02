// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    /** Hands the scene to the hook a test installed with onRender, as three would draw it. */
    render(scene: unknown): void {
      ;(globalThis as { onTestRender?: (scene: unknown) => void }).onTestRender?.(scene)
    }
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { flush } from './assets/test-helpers.js'
import { Sprite } from './components/sprite.js'
import type { Game } from './game.js'
import { loadScene } from './scene.js'
import { defined } from './test-support.js'
import {
  basic,
  makeGame,
  materials,
  meshes,
  onlyRun,
  REGISTRY,
  renderFrame,
  runMeshes,
  scene,
  spriteEntity,
  useSpriteBatchTestEnvironment,
} from './test-sprite-batches.js'

useSpriteBatchTestEnvironment()

function spawnSprites(game: Game, count: number, prefix: string): void {
  for (let i = 0; i < count; i += 1) game.spawn(`${prefix}${i}`).add(Sprite, { texture: '/hero.png' })
}

it('reuses freed slots: spawn 100, destroy 50, spawn 50 keeps the capacity and every GPU object (CA-4)', async () => {
  const game = makeGame()
  spawnSprites(game, 100, 'A')
  await flush()
  renderFrame(game)
  const run = onlyRun(game)
  const geometry = run.geometry
  const before = materials(game)
  expect(run.instanceMatrix.count).toBe(128)

  for (const entity of game.entities.slice(0, 50)) entity.destroy()
  spawnSprites(game, 50, 'B')
  renderFrame(game)

  expect(onlyRun(game)).toBe(run)
  expect(onlyRun(game).geometry).toBe(geometry)
  expect(onlyRun(game).instanceMatrix.count).toBe(128)
  expect(onlyRun(game).count).toBe(100)
  expect(materials(game)).toEqual(before)
  game.dispose()
})

it('grows exactly once when a spawn passes the capacity (CA-4)', async () => {
  const game = makeGame()
  spawnSprites(game, 16, 'A')
  await flush()
  renderFrame(game)
  const first = onlyRun(game)
  expect(first.instanceMatrix.count).toBe(16)
  const disposeGeometry = vi.spyOn(first.geometry, 'dispose')

  spawnSprites(game, 1, 'B')
  renderFrame(game)
  const grown = onlyRun(game)
  renderFrame(game)

  expect(grown).not.toBe(first)
  expect(grown.instanceMatrix.count).toBe(32)
  expect(onlyRun(game)).toBe(grown)
  expect(disposeGeometry).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('starts every buffer at 16 slots and never shrinks during the scene (CA-4)', async () => {
  const game = makeGame()
  spawnSprites(game, 3, 'A')
  await flush()
  renderFrame(game)
  expect(onlyRun(game).instanceMatrix.count).toBe(16)

  spawnSprites(game, 40, 'B')
  renderFrame(game)
  for (const entity of game.entities.slice(0, 40)) entity.destroy()
  renderFrame(game)

  expect(onlyRun(game).instanceMatrix.count).toBe(64)
  expect(onlyRun(game).count).toBe(3)
  game.dispose()
})

for (const release of ['unloadScene', 'dispose'] as const) {
  it(`releases every batch resource at ${release} (CA-4)`, async () => {
    const game = makeGame()
    loadScene(game, scene([spriteEntity('A', { texture: '/hero.png' }), spriteEntity('B', { layer: 1 })]), REGISTRY)
    await flush()
    renderFrame(game)
    const runs = runMeshes(game)
    expect(runs).toHaveLength(2)
    const spies = runs.flatMap((run) => [
      vi.spyOn(run, 'dispose'),
      vi.spyOn(run.geometry, 'dispose'),
      vi.spyOn(basic(run.material), 'dispose'),
    ])
    const map = vi.spyOn(defined(basic(defined(runs[0]).material).map), 'dispose')

    game[release]()

    for (const spy of [...spies, map]) expect(spy).toHaveBeenCalledTimes(1)
    expect(meshes(game)).toEqual([])
    if (release === 'unloadScene') game.dispose()
  })
}
