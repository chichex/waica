// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { FakeTextureBackend, flush } from './assets/test-helpers.js'
import { Light } from './components/light.js'
import { ParticleEmitter } from './components/particle-emitter.js'
import { Tilemap } from './components/tilemap.js'
import { Game, type GameResolution } from './game.js'
import { isFrameQuad } from './frame-quad.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { loadScene, type SceneEntityJson, type SceneRenderJson } from './scene.js'
import { occluderRevision } from './scene-lighting.js'
import { fakeRendering, type FakeDraw } from './test-renderer.js'
import { REGISTRY, renderFrame, runMeshes, scene, spriteEntity, useSpriteBatchTestEnvironment } from './test-sprite-batches.js'
import { defined } from './test-support.js'

useSpriteBatchTestEnvironment()

const LIT_REGISTRY = { components: { ...REGISTRY.components, Light, ParticleEmitter, Tilemap } }
/** Layer 0 only: every drawable that is not Emissive. */
const LIT_MASK = 1
const EMISSIVE_MASK = 1 << EMISSIVE_LAYER

async function readyGame(resolution?: GameResolution): Promise<Game> {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({ canvas, textures: new FakeTextureBackend(), resolution })
  await game.ready()
  return game
}

/** The render calls of one frame drawn with no Simulation Step. */
function frameDraws(game: Game): FakeDraw[] {
  fakeRendering.draws.length = 0
  renderFrame(game)
  return [...fakeRendering.draws]
}

function lightEntity(name: string, position: [number, number], props: Record<string, unknown> = {}): SceneEntityJson {
  return { name, position, components: [{ type: 'Light', props }] }
}

function load(game: Game, entities: SceneEntityJson[], render?: SceneRenderJson): void {
  loadScene(game, scene(entities, render), LIT_REGISTRY)
}

function isTarget(value: unknown): value is THREE.RenderTarget {
  return value instanceof THREE.RenderTarget
}

function targetOf(draw: FakeDraw | undefined): THREE.RenderTarget {
  const target = draw?.target
  if (!isTarget(target)) throw new Error('expected a draw into a render target')
  return target
}

/** Run meshes three would draw for the camera layers of the render in progress. */
function runCountsDuring(game: Game, drawIndex: number): number[][] {
  const seen: number[][] = []
  let index = 0
  fakeRendering.onRender = () => {
    if (index === drawIndex) seen.push(runMeshes(game).map((run) => run.count))
    index += 1
  }
  renderFrame(game)
  fakeRendering.onRender = null
  return seen
}

for (const resolution of [undefined, { width: 320, height: 180 }]) {
  it(`off path (CA-1, B4): draws an unlit scene straight to the canvas in one render, with no render target (${resolution ? 'fixed' : 'fill'})`, async () => {
    const game = await readyGame(resolution)
    load(game, [spriteEntity('A', { texture: '/a.png' }), spriteEntity('B', { texture: '/a.png', layer: 1 })])
    await flush()
    for (let frame = 0; frame < 3; frame += 1) {
      const draws = frameDraws(game)
      expect(draws).toHaveLength(1)
      expect(draws[0]).toMatchObject({ scene: game.scene, target: null, autoClear: true })
    }
    expect(fakeRendering.renderTargets).toEqual([])
    game.dispose()
  })
}

it('off path (CA-1, B4): draws an Emissive sprite of an unlit scene in the same single render', async () => {
  const game = await readyGame()
  load(game, [spriteEntity('Flame', { texture: '/flame.png', emissive: true })])
  await flush()
  const draws = frameDraws(game)
  expect(draws).toHaveLength(1)
  expect((draws[0]?.layers ?? 0) & EMISSIVE_MASK).toBe(EMISSIVE_MASK)
  expect(fakeRendering.renderTargets).toEqual([])
  game.dispose()
})

it('off path (CA-1, B4): goes back to the single render, building nothing new, once the scene’s last Light is destroyed', async () => {
  const game = await readyGame()
  load(game, [lightEntity('Torch', [0, 0])])
  expect(frameDraws(game)).toHaveLength(4)
  const built = fakeRendering.renderTargets.length
  game.find('Torch')?.destroy()
  const draws = frameDraws(game)
  expect(draws).toHaveLength(1)
  expect(draws[0]).toMatchObject({ scene: game.scene, target: null })
  expect(fakeRendering.renderTargets).toHaveLength(built)
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): draws the scene, then the light-map as one quad over it, then the Emissive drawables', async () => {
  const game = await readyGame()
  load(game, [spriteEntity('Wall', { texture: '/a.png' })], { lighting: { ambient: { intensity: 0.4 } } })
  await flush()
  const background = game.scene.background
  const draws = frameDraws(game)
  expect(draws.map((draw) => ({ target: isTarget(draw.target), layers: draw.layers, autoClear: draw.autoClear }))).toEqual([
    { target: false, layers: LIT_MASK, autoClear: true },
    { target: true, layers: LIT_MASK | EMISSIVE_MASK, autoClear: true },
    { target: false, layers: draws[2]?.layers ?? null, autoClear: false },
    { target: false, layers: EMISSIVE_MASK, autoClear: false },
  ])
  expect(draws[0]?.scene).toBe(game.scene)
  expect(draws[0]?.background).toBe(background)
  // An ordinary scene, never a QuadMesh: on WebGPU a QuadMesh drawn to the canvas
  // loses the frame on the next canvas render (issue #78 e2e).
  expect(draws[2]?.scene).not.toBeInstanceOf(THREE.QuadMesh)
  expect(isFrameQuad(draws[2]?.scene)).toBe(true)
  expect(draws[3]?.scene).toBe(game.scene)
  expect(draws[3]?.background).toBeNull()
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): leaves the camera, the background, autoClear and the clear color as it found them', async () => {
  const game = await readyGame({ width: 320, height: 180 })
  load(game, [], { lighting: { ambient: { color: '#336699', intensity: 0.5 } } })
  const mask = game.camera.layers.mask
  const background = game.scene.background
  renderFrame(game)
  const renderer = defined(fakeRendering.renderers.at(-1))
  expect(game.camera.layers.mask).toBe(mask)
  expect(game.scene.background).toBe(background)
  expect(renderer.autoClear).toBe(true)
  expect(renderer.renderTarget).toBeNull()
  expect(new THREE.Color().set(renderer.clearColor instanceof THREE.Color ? renderer.clearColor : 0xffffff).getHex()).toBe(0x000000)
  expect(renderer.clearAlpha).toBe(1)
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): clears the light-map to the Ambient Light’s color × intensity', async () => {
  const game = await readyGame()
  load(game, [], { lighting: { ambient: { color: '#ff8000', intensity: 0.5 } } })
  let clear: THREE.Color | null = null
  let index = 0
  fakeRendering.onRender = () => {
    const renderer = defined(fakeRendering.renderers.at(-1))
    if (index === 1 && renderer.clearColor instanceof THREE.Color) clear = renderer.clearColor.clone()
    index += 1
  }
  renderFrame(game)
  expect(defined<THREE.Color | null>(clear).toArray()).toEqual([0.5, (128 / 255) * 0.5, 0])
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): draws one light-map mesh per live Light, and drops a destroyed one on the next frame (CA-4)', async () => {
  const game = await readyGame()
  load(game, [lightEntity('A', [0, 0]), lightEntity('B', [3, 0])])
  const lightMeshes = (draws: FakeDraw[]): number => {
    const lightScene = draws[1]?.scene
    if (!(lightScene instanceof THREE.Scene)) throw new Error('expected the light-map scene')
    return lightScene.children.filter((child) => child instanceof THREE.Mesh).length
  }
  expect(lightMeshes(frameDraws(game))).toBe(2)
  game.find('A')?.destroy()
  expect(lightMeshes(frameDraws(game))).toBe(1)
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): keeps Emissive sprites out of the scene pass and draws them, still batched, after the light-map (CA-10)', async () => {
  const game = await readyGame()
  load(game, [
    spriteEntity('Floor', { texture: '/a.png', layer: 0 }),
    spriteEntity('FlameA', { texture: '/flame.png', emissive: true, layer: 1 }),
    spriteEntity('FlameB', { texture: '/flame.png', emissive: true, layer: 2 }),
    spriteEntity('Wall', { texture: '/a.png', layer: 3 }),
  ], { lighting: {} })
  await flush()
  expect(runCountsDuring(game, 0)).toEqual([[2]])
  expect(runCountsDuring(game, 3)).toEqual([[2]])
  game.dispose()
})

it('lit frame (CA-8, ADR 0026): puts an Emissive drawable on the Emissive layer only, per sprite and per particle emitter (CA-10)', async () => {
  const game = await readyGame()
  load(game, [
    spriteEntity('Flame', { texture: '/flame.png', emissive: true }),
    spriteEntity('Wall', { texture: '/a.png' }),
    { name: 'Sparks', position: [0, 0], components: [{ type: 'ParticleEmitter', props: { emissive: true } }] },
  ], { batch: false })
  const meshOf = (name: string): THREE.Object3D => defined(defined(game.find(name)).node.children[0])
  expect(meshOf('Flame').layers.mask).toBe(EMISSIVE_MASK)
  expect(meshOf('Wall').layers.mask).toBe(LIT_MASK)
  const particles = game.scene.children.find((child) => child instanceof THREE.Mesh && child.layers.mask === EMISSIVE_MASK)
  expect(particles).toBeDefined()
  game.dispose()
})

it('light-map resolution (CA-9, B2): is the fixed resolution, upscaled with nearest filtering', async () => {
  const game = await readyGame({ width: 320, height: 180 })
  load(game, [lightEntity('Torch', [0, 0])])
  const target = targetOf(frameDraws(game)[1])
  expect([target.width, target.height]).toEqual([320, 180])
  expect(target.texture.magFilter).toBe(THREE.NearestFilter)
  expect(target.texture.minFilter).toBe(THREE.NearestFilter)
  expect(target.texture.type).toBe(THREE.UnsignedByteType)
  game.dispose()
})

it('light-map resolution (CA-9, B2): matches the drawing buffer without a fixed resolution', async () => {
  const game = await readyGame()
  load(game, [lightEntity('Torch', [0, 0])])
  const target = targetOf(frameDraws(game)[1])
  expect([target.width, target.height]).toEqual([640, 360])
  game.dispose()
})

it('Post Effects (CA-11): renders an unlit scene with a vignette into a render target, then one pass to the canvas', async () => {
  const game = await readyGame({ width: 320, height: 180 })
  load(game, [spriteEntity('A', { texture: '/a.png' })], { post: { vignette: { intensity: 0.5, radius: 0.5 } } })
  await flush()
  const draws = frameDraws(game)
  expect(draws).toHaveLength(2)
  expect(draws[0]?.scene).toBe(game.scene)
  const target = targetOf(draws[0])
  expect([target.width, target.height]).toEqual([320, 180])
  expect(target.texture.magFilter).toBe(THREE.NearestFilter)
  // An ordinary scene, never a QuadMesh: on WebGPU a QuadMesh drawn to the canvas
  // loses the frame on the next canvas render (issue #78 e2e).
  expect(draws[1]?.scene).not.toBeInstanceOf(THREE.QuadMesh)
  expect(isFrameQuad(draws[1]?.scene)).toBe(true)
  expect(draws[1]?.target).toBeNull()
  game.dispose()
})

it('Post Effects (CA-11): draws the scene in linear color into the target: its background is the true color, not the canvas one', async () => {
  const game = await readyGame()
  load(game, [], { post: { colorGrade: { saturation: 0 } } })
  const draws = frameDraws(game)
  const background = draws[0]?.background
  if (!(background instanceof THREE.Color)) throw new Error('expected a color background')
  expect(background.getHexString(THREE.LinearSRGBColorSpace)).toBe(new THREE.Color(0x1a1a2e).getHexString(THREE.LinearSRGBColorSpace))
  game.dispose()
})

it('Post Effects (CA-11): composes lighting inside the target and applies the effects after the Emissive drawables', async () => {
  const game = await readyGame()
  load(game, [lightEntity('Torch', [0, 0])], { post: { vignette: { intensity: 1, radius: 0 } } })
  const draws = frameDraws(game)
  expect(draws).toHaveLength(5)
  const sceneTarget = targetOf(draws[0])
  expect(targetOf(draws[1])).not.toBe(sceneTarget)
  expect(targetOf(draws[2])).toBe(sceneTarget)
  expect(draws[3]).toMatchObject({ scene: game.scene, layers: EMISSIVE_MASK, target: sceneTarget })
  // An ordinary scene, never a QuadMesh: on WebGPU a QuadMesh drawn to the canvas
  // loses the frame on the next canvas render (issue #78 e2e).
  expect(draws[4]?.scene).not.toBeInstanceOf(THREE.QuadMesh)
  expect(isFrameQuad(draws[4]?.scene)).toBe(true)
  expect(draws[4]?.target).toBeNull()
  game.dispose()
})

it('Post Effects (CA-11): switches off at runtime back to the single canvas render', async () => {
  const game = await readyGame()
  load(game, [], { post: { vignette: { intensity: 1, radius: 0 } } })
  expect(frameDraws(game)).toHaveLength(2)
  game.post.vignette = null
  expect(frameDraws(game)).toHaveLength(1)
  game.dispose()
})

it('lifecycle: disposes every render target it built when the Game is disposed', async () => {
  const game = await readyGame()
  load(game, [lightEntity('Torch', [0, 0])], { post: { vignette: { intensity: 1, radius: 0 } } })
  renderFrame(game)
  const disposed: unknown[] = []
  for (const target of fakeRendering.renderTargets) {
    if (isTarget(target)) target.addEventListener('dispose', () => disposed.push(target))
  }
  expect(fakeRendering.renderTargets.length).toBeGreaterThan(0)
  game.dispose()
  expect(disposed).toHaveLength(fakeRendering.renderTargets.length)
})

it('lifecycle: rebuilds occlusion only when a Tilemap’s solid tiles change, never per frame (inference 9)', async () => {
  const game = await readyGame()
  load(game, [
    { name: 'Ground', position: [0, 0], components: [{ type: 'Tilemap', props: { mapWidth: 2, mapHeight: 1, cells: [0, 1], solidTiles: [1] } }] },
    lightEntity('Torch', [0, 0]),
  ])
  const loaded = occluderRevision(game.lighting)
  renderFrame(game)
  renderFrame(game)
  expect(occluderRevision(game.lighting)).toBe(loaded)
  const ground = defined(defined(game.find('Ground')).get(Tilemap))
  ground.solidTiles = [0, 1]
  expect(occluderRevision(game.lighting)).toBeGreaterThan(loaded)
  const edited = occluderRevision(game.lighting)
  game.find('Ground')?.destroy()
  expect(occluderRevision(game.lighting)).toBeGreaterThan(edited)
  game.dispose()
})
