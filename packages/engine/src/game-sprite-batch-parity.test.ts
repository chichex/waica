// @vitest-environment happy-dom
import * as THREE from 'three'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { flush } from './assets/test-helpers.js'
import { ParticleEmitter } from './components/particle-emitter.js'
import { Sprite } from './components/sprite.js'
import { Tilemap } from './components/tilemap.js'
import type { Game } from './game.js'
import type { RuntimeMetadata } from './runtime-bridge.js'
import { RuntimeInspector } from './runtime-inspection.js'
import { loadScene, type SceneEntityJson, type SceneRenderJson } from './scene.js'
import { defined } from './test-support.js'
import {
  animatedEntity,
  drawnMeshes,
  instances,
  readyGame,
  meshRecord,
  onRender,
  REGISTRY,
  renderFrame,
  runMeshes,
  scene,
  spriteEntity,
  stepFrame,
  transparentDrawOrder,
  useSpriteBatchTestEnvironment,
  type AnyMesh,
  type BasicMesh,
} from './test-sprite-batches.js'
import { lastFakeRenderer } from './test-renderer.js'

useSpriteBatchTestEnvironment()

const PACKED_CELLS = [
  { x: 0, y: 0, width: 16, height: 32 },
  { x: 16, y: 0, width: 8, height: 16 },
]

const VARIETY: SceneEntityJson[] = [
  spriteEntity('Plain', { texture: '/hero.png' }, [-3, 2]),
  spriteEntity('Sized', { texture: '/hero.png', width: 2, height: 3, offsetX: 0.5, offsetY: -0.25 }, [1, 1]),
  spriteEntity('Anchored', { texture: '/hero.png', anchorX: 0, anchorY: 0, layer: 2 }, [2, -1]),
  spriteEntity('Tinted', { color: 0x3366cc, layer: -1 }, [-1, -2]),
  spriteEntity('Ball', { color: 0xcc3366, shape: 'circle', width: 0.5 }, [3, 3]),
  spriteEntity('Pixel', { texture: '/hero.png', pixelArt: true }, [0, -3]),
  animatedEntity('Walker', {}, [-2, 0]),
  animatedEntity('Mirrored', { flipX: true, width: 2, anchorY: 0 }, [4, -2]),
  animatedEntity('Packed', { cells: PACKED_CELLS, clips: { walk: { frames: [0, 1], fps: 10 } } }, [-4, -3]),
]

/** The same scene twice, batched and not, advanced in lockstep with one rotated and scaled entity. */
async function twinGames(render: SceneRenderJson): Promise<{ batched: Game; unbatched: Game }> {
  const batched = await readyGame()
  const unbatched = await readyGame()
  loadScene(batched, scene(VARIETY, render), REGISTRY)
  loadScene(unbatched, scene(VARIETY, { ...render, batch: false }), REGISTRY)
  for (const game of [batched, unbatched]) {
    const turned = defined(game.find('Sized'))
    turned.node.rotation.z = 0.3
    turned.scale.set(1.5, 0.5, 1)
  }
  await flush()
  for (let step = 0; step < 4; step += 1) {
    stepFrame(batched)
    stepFrame(unbatched)
  }
  // The mocked render never updates matrices; three's render would.
  unbatched.scene.updateMatrixWorld()
  unbatched.camera.updateMatrixWorld()
  return { batched, unbatched }
}

for (const render of [{}, { sort: 'y' }, { projection: 'isometric', sort: 'y' }] as const) {
  it(`reproduces matrix, color and UV sprite by sprite under ${JSON.stringify(render)} (CA-3)`, async () => {
    const { batched, unbatched } = await twinGames(render)

    const drawn = instances(batched)
    const expected = drawnMeshes(unbatched).map((mesh) => meshRecord(unbatched, mesh as BasicMesh))
    expect(drawn).toHaveLength(VARIETY.length)
    expect(expected).toHaveLength(VARIETY.length)
    for (const record of expected) {
      const matches = drawn.filter((instance) => instance.matrix.every((value, i) => value === record.matrix[i]))
      expect(matches).toHaveLength(1)
      expect(defined(matches[0]).color).toEqual(record.color)
      expect(defined(matches[0]).uv).toEqual(record.uv)
    }
    batched.dispose()
    unbatched.dispose()
  })
}

interface RenderOrders {
  runs: number[]
  tiles: number
  particles: number
}

/** Three same-key sprites on layers 0, 2 and 4 around a tilemap (layer 1) and a particle batch (layer 3). */
async function interleavedScene(): Promise<{ game: Game; tileMesh: THREE.Object3D; particleMesh: THREE.Object3D }> {
  const game = await readyGame()
  const sprites = [0, 2, 4].map((layer) => spriteEntity(`Layer${layer}`, { texture: '/hero.png', layer }))
  loadScene(game, scene(sprites), REGISTRY)
  game.spawn('Tiles').add(Tilemap, { layer: 1, mapWidth: 2, mapHeight: 1, cells: [0, 0] })
  game.spawn('Dust').add(ParticleEmitter, { layer: 3 }).emit(2)
  await flush()
  const tileMesh = defined(defined(game.find('Tiles')).node.children[0])
  const isParticles = (mesh: THREE.Object3D): boolean =>
    mesh.parent === game.scene && !(mesh instanceof THREE.InstancedMesh)
  const particleMesh = defined(drawnMeshes(game).find(isParticles), 'the particle batch mesh')
  return { game, tileMesh, particleMesh }
}

it('keeps runs interleaved with a tilemap and a particle batch exactly where they draw today (CA-2, CA-3)', async () => {
  const { game, tileMesh, particleMesh } = await interleavedScene()
  const seen: RenderOrders[] = []
  onRender(() => {
    // View z of each run's only instance tells back (layer 0) from front (layer 4).
    const byDepth = runMeshes(game).sort((a, b) => (a.instanceMatrix.array[14] ?? 0) - (b.instanceMatrix.array[14] ?? 0))
    seen.push({ runs: byDepth.map((run) => run.renderOrder), tiles: tileMesh.renderOrder, particles: particleMesh.renderOrder })
  })

  renderFrame(game)

  expect(seen).toHaveLength(1)
  const [orders] = seen
  const [back, middle, front] = defined(orders).runs
  expect(defined(orders).runs).toHaveLength(3)
  expect(defined(back)).toBeLessThan(defined(orders).tiles)
  expect(defined(orders).tiles).toBeLessThan(defined(middle))
  expect(defined(middle)).toBeLessThan(defined(orders).particles)
  expect(defined(orders).particles).toBeLessThan(defined(front))
  // The pinned order is undone once three has drawn.
  expect(tileMesh.renderOrder).toBe(0)
  expect(particleMesh.renderOrder).toBe(0)
  game.dispose()
})

it('leaves the scene untouched when no sprite batches (CA-6)', async () => {
  const game = await readyGame()
  loadScene(game, scene([spriteEntity('Solo', {})], { batch: false }), REGISTRY)
  await flush()
  const updateMatrixWorld = vi.spyOn(game.scene, 'updateMatrixWorld')

  renderFrame(game)

  expect(updateMatrixWorld).not.toHaveBeenCalled()
  expect(game.scene.matrixWorldAutoUpdate).toBe(true)
  game.dispose()
})

it('reports the same Runtime Snapshot with and without batching (CA-3)', async () => {
  const { batched, unbatched } = await twinGames({ sort: 'y' })
  const metadata = { frame: 0 } as RuntimeMetadata
  const entities = (game: Game): unknown => new RuntimeInspector(game).snapshot(metadata).entities

  expect(entities(batched)).toEqual(entities(unbatched))
  batched.dispose()
  unbatched.dispose()
})

/** What a drawn mesh shows: its entity's name, or for a run every sprite it draws (found by view-space x). */
function labeller(game: Game): (mesh: AnyMesh) => string {
  const byNode = (mesh: THREE.Object3D): string => game.entities.find((entity) => entity.node === mesh.parent)?.name ?? '?'
  return (mesh) => {
    if (!(mesh instanceof THREE.InstancedMesh)) return byNode(mesh)
    const xs = Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12] ?? NaN)
    return xs.map((x) => game.entities.find((entity) => entity.position.x === x)?.name ?? '?').join(',')
  }
}

/** A same-key sprite in front (layer 3) under a plain node, then a tilemap and a sprite whose nodes set renderOrder 5. */
function groupOrderScene(game: Game, render: SceneRenderJson): void {
  loadScene(game, scene([spriteEntity('Front', { texture: '/a.png', layer: 3 }, [-3, 0])], render), REGISTRY)
  const tiles = game.spawn('Tiles')
  tiles.node.renderOrder = 5
  tiles.add(Tilemap, { layer: 0, mapWidth: 1, mapHeight: 1, cells: [0] })
  const lifted = game.spawn('Lifted')
  lifted.position.set(3, 0, 0)
  lifted.node.renderOrder = 5
  lifted.add(Sprite, { texture: '/a.png', layer: 1 })
}

it("keeps the renderOrder of a sprite's ancestor Group, drawing in the same order as without batching (review)", async () => {
  const orders = new Map<string, string[]>()
  for (const render of [{}, { batch: false }]) {
    const game = await readyGame()
    groupOrderScene(game, render)
    await flush()
    onRender(() => orders.set(JSON.stringify(render), transparentDrawOrder(game, labeller(game))))
    renderFrame(game)
    game.dispose()
  }
  // Group order 0 first, then the renderOrder-5 group: farther tilemap, then the sprite.
  expect(orders.get('{"batch":false}')).toEqual(['Front', 'Tiles', 'Lifted'])
  expect(orders.get('{}')).toEqual(['Front', 'Tiles', 'Lifted'])
})

it('writes no instance for an off-camera sprite and lets an off-camera renderable not split a run (review: frustum culling)', async () => {
  const game = await readyGame()
  loadScene(
    game,
    scene([
      spriteEntity('Near', { texture: '/a.png', layer: 0 }, [0, 0]),
      spriteEntity('Gone', { texture: '/a.png', layer: 1 }, [1000, 0]),
      spriteEntity('Also', { texture: '/a.png', layer: 2 }, [1, 0]),
    ]),
    REGISTRY,
  )
  const far = game.spawn('FarTiles')
  far.position.set(-1000, 0, 0)
  far.add(Tilemap, { layer: 1.5, mapWidth: 1, mapHeight: 1, cells: [0] })
  await flush()

  renderFrame(game)

  const runs = runMeshes(game)
  expect(runs).toHaveLength(1)
  expect(defined(runs[0]).count).toBe(2)
  expect(labeller(game)(defined(runs[0]))).toBe('Near,Also')
  game.dispose()
})

it('draws every mesh with its model view computed on the CPU, exactly as a batch instance carries it (ADR 0024, ADR 0025)', async () => {
  const game = await readyGame()

  expect(lastFakeRenderer().highPrecision).toBe(true)
  game.dispose()
})
