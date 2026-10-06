// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { FakeTextureBackend, flush } from './assets/test-helpers.js'
import { AnimatedSprite } from './components/animated-sprite.js'
import { loadScene } from './scene.js'
import { SpriteBatches } from './sprite-batches.js'
import { defined } from './test-support.js'
import {
  animatedEntity,
  instances,
  linear,
  readyGame,
  materials,
  onlyRun,
  REGISTRY,
  renderFrame,
  runMeshes,
  scene,
  spriteEntity,
  spriteOf,
  stepFrame,
  useSpriteBatchTestEnvironment,
} from './test-sprite-batches.js'

useSpriteBatchTestEnvironment()

/** 0.15 s of Simulation Steps: mid-way through the second frame of a 10 fps clip. */
function playOneFrame(game: Parameters<typeof stepFrame>[0]): void {
  for (let step = 0; step < 9; step += 1) stepFrame(game)
}

it('draws many animated sprites of one sheet with one material in one run (CA-1)', async () => {
  const game = await readyGame()
  loadScene(game, scene(Array.from({ length: 20 }, (_, i) => animatedEntity(`A${i}`, {}))), REGISTRY)
  await flush()
  stepFrame(game)

  expect(materials(game).size).toBe(1)
  expect(onlyRun(game).count).toBe(20)
  game.dispose()
})

it("writes each frame's UV offset and repeat into its instance by the next rendered frame (CA-5)", async () => {
  const game = await readyGame()
  loadScene(game, scene([animatedEntity('Walker', {})]), REGISTRY)
  await flush()
  renderFrame(game)
  // 64×64 fake image, 4×2 grid: 16×32 cells, frame 0 at the top-left.
  expect(defined(instances(game)[0]).uv).toEqual([0.25, 0.5, 0, 0.5])

  playOneFrame(game)
  // Frame 1: the second cell of the top row.
  expect(defined(instances(game)[0]).uv).toEqual([0.25, 0.5, 0.25, 0.5])
  game.dispose()
})

it('mirrors a flipped sprite through its instance matrix, like its own mesh (CA-5)', async () => {
  const game = await readyGame()
  loadScene(game, scene([animatedEntity('Walker', { width: 2 })]), REGISTRY)
  await flush()
  const sprite = defined(defined(game.find('Walker')).get(AnimatedSprite))
  renderFrame(game)
  expect(defined(instances(game)[0]).matrix[0]).toBe(2)

  sprite.setFlipX(true)
  renderFrame(game)
  expect(defined(instances(game)[0]).matrix[0]).toBe(-2)
  game.dispose()
})

it("moves to the run of another sheet's key when its frame lands on that sheet (CA-5)", async () => {
  const game = await readyGame()
  const extraSheets = [{ texture: '/second.png', cols: 1, rows: 1 }]
  const clips = { both: { frames: [0, 8], fps: 10 } }
  loadScene(game, scene([animatedEntity('Walker', { extraSheets, clips, initialClip: 'both' })]), REGISTRY)
  await flush()
  renderFrame(game)
  const first = defined(instances(game)[0]).map

  playOneFrame(game)
  const second = defined(instances(game)[0]).map

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second).not.toBe(first)
  expect(runMeshes(game)).toHaveLength(1)
  game.dispose()
})

it('draws a frame of a failed sheet as the untextured quad, like its own mesh (CA-1)', async () => {
  const textures = new FakeTextureBackend()
  textures.failUrl('/sheet.png')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const game = await readyGame(textures)
  loadScene(game, scene([animatedEntity('Walker', {})]), REGISTRY)
  await flush()
  renderFrame(game)

  expect(defined(instances(game)[0]).map).toBeNull()
  expect(defined(instances(game)[0]).color).toEqual(linear(0xffffff))
  game.dispose()
})

it('updates its instance after width, height, offset, anchor, color and layer change (CA-5)', async () => {
  const game = await readyGame()
  loadScene(game, scene([spriteEntity('Live', {})]), REGISTRY)
  await flush()
  const sprite = spriteOf(game, 'Live')
  renderFrame(game)
  // Camera at z 10 looking down -z: view z = scene z - 10.
  expect(defined(instances(game)[0]).matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1])

  sprite.width = 2
  sprite.height = 4
  sprite.offsetX = 1
  sprite.offsetY = -1
  sprite.anchorY = 0
  sprite.color = 0x00ff00
  sprite.layer = 3
  renderFrame(game)

  const live = defined(instances(game)[0])
  // Bottom anchor: the quad's centre sits half its height above offsetY.
  expect(live.matrix).toEqual([2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 1, 1, Math.fround(0.03 - 10), 1])
  expect(live.color).toEqual(linear(0x00ff00))
  game.dispose()
})

it('moves to the circle entry when its shape changes (CA-5)', async () => {
  const game = await readyGame()
  loadScene(game, scene([spriteEntity('Shape', { color: 0xff0000 })]), REGISTRY)
  await flush()
  renderFrame(game)
  const rectangle = onlyRun(game).geometry.getAttribute('position').count

  spriteOf(game, 'Shape').shape = 'circle'
  renderFrame(game)

  expect(onlyRun(game).geometry.getAttribute('position').count).not.toBe(rectangle)
  expect(defined(instances(game)[0]).color).toEqual(linear(0xff0000))
  game.dispose()
})

it('skips the batch move on frames that stay on the same sheet (review: no per-step key allocation)', async () => {
  const game = await readyGame()
  loadScene(game, scene([animatedEntity('Walker', {})]), REGISTRY)
  await flush()
  renderFrame(game)
  const move = vi.spyOn(SpriteBatches.prototype, 'move')

  playOneFrame(game)

  expect(defined(instances(game)[0]).uv).toEqual([0.25, 0.5, 0.25, 0.5])
  expect(move).not.toHaveBeenCalled()
  game.dispose()
})
