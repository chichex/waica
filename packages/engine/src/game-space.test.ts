// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { gameViewport } from './anchored-pieces.js'
import { FakeTextureBackend } from './assets/test-helpers.js'
import { Game, type GameResolution } from './game.js'
import { loadScene, spawnFromJson, type SceneJson, type SceneRenderJson } from './scene.js'
import type { SceneCameraJson } from './camera.js'
import { fakeRendering, lastFakeRenderer } from './test-renderer.js'
import { REGISTRY, renderFrame, useSpriteBatchTestEnvironment } from './test-sprite-batches.js'
import { defined } from './test-support.js'

useSpriteBatchTestEnvironment()

interface SizedGame {
  game: Game
  width: number
  height: number
}

async function readyGame(options: { resolution?: GameResolution; width?: number; height?: number; viewHeight?: number } = {}): Promise<SizedGame> {
  const width = options.width ?? 640
  const height = options.height ?? 360
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: width }, clientHeight: { value: height } })
  document.body.append(canvas)
  const game = new Game({ canvas, textures: new FakeTextureBackend(), resolution: options.resolution, viewHeight: options.viewHeight })
  await game.ready()
  return { game, width, height }
}

function threeD(render: SceneRenderJson = {}, camera?: SceneCameraJson): SceneJson {
  return { waicaScene: 3, render: { space: '3d', ...render }, ...(camera ? { camera } : {}), entities: [] }
}

const PERSPECTIVE: SceneCameraJson = { kind: 'perspective', position: [0, 4, 12], target: [0, 1, 0], fov: 50, near: 0.5, far: 80 }

describe('scene space (CA-1)', () => {
  it('is 2d with no scene, in a scene without the field and after a 2d scene loads', async () => {
    const { game } = await readyGame()
    expect(game.space).toBe('2d')
    loadScene(game, { waicaScene: 3, entities: [] }, REGISTRY)
    expect(game.space).toBe('2d')
    loadScene(game, { waicaScene: 3, render: { space: '2d' }, entities: [] }, REGISTRY)
    expect(game.space).toBe('2d')
  })

  it('is 3d after loading a scene with render.space 3d, and 2d again after unloadScene()', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD(), REGISTRY)
    expect(game.space).toBe('3d')
    game.unloadScene()
    expect(game.space).toBe('2d')
  })

  it('follows each scene of a swap: 3d, then a 2d scene', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD(), REGISTRY)
    loadScene(game, { waicaScene: 3, entities: [] }, REGISTRY)
    expect(game.space).toBe('2d')
  })
})

describe('camera kinds (CA-2)', () => {
  it('keeps the orthographic camera, and its framing, in a 2d scene', async () => {
    const { game } = await readyGame({ viewHeight: 10 })
    const camera = game.camera
    expect(camera).toBeInstanceOf(THREE.OrthographicCamera)
    loadScene(game, { waicaScene: 3, camera: { position: [3, 4], zoom: 12 }, entities: [] }, REGISTRY)
    expect(game.camera).toBe(camera)
    expect(camera.position.toArray()).toEqual([3, 4, 10])
    const ortho = camera as THREE.OrthographicCamera
    expect([ortho.top, ortho.bottom]).toEqual([6, -6])
    expect(ortho.right - ortho.left).toBeCloseTo(12 * (640 / 360))
  })

  it('makes game.camera a PerspectiveCamera placed, aimed and lensed by the block', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    const camera = game.camera
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera)
    const perspective = camera as THREE.PerspectiveCamera
    expect(perspective.position.toArray()).toEqual([0, 4, 12])
    expect([perspective.fov, perspective.near, perspective.far]).toEqual([50, 0.5, 80])
    perspective.updateMatrixWorld()
    const forward = perspective.getWorldDirection(new THREE.Vector3())
    const expected = new THREE.Vector3(0, 1, 0).sub(new THREE.Vector3(0, 4, 12)).normalize()
    expect(forward.distanceTo(expected)).toBeLessThan(1e-6)
  })

  it('gives a 3d scene without a camera block the perspective defaults', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD(), REGISTRY)
    const camera = game.camera as THREE.PerspectiveCamera
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera)
    expect([camera.fov, camera.near, camera.far]).toEqual([60, 0.1, 1000])
    expect(camera.position.toArray()).toEqual([0, 5, 10])
  })

})

describe('camera kinds, per space (CA-2)', () => {
  it('ignores a camera block of the wrong kind for the space (validate_project reports it)', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({}, { zoom: 20 }), REGISTRY)
    expect(game.camera).toBeInstanceOf(THREE.PerspectiveCamera)
    loadScene(game, { waicaScene: 3, camera: PERSPECTIVE, entities: [] }, REGISTRY)
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
  })

  it('brings the same orthographic camera back, framed as the Game was built, after a 3d scene', async () => {
    const { game } = await readyGame({ viewHeight: 10 })
    const ortho = game.camera
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    expect(game.camera).not.toBe(ortho)
    game.unloadScene()
    expect(game.camera).toBe(ortho)
    const frame = ortho as THREE.OrthographicCamera
    expect([frame.top, frame.bottom]).toEqual([5, -5])
    expect(frame.right).toBeCloseTo(5 * (640 / 360))
  })
})

describe('resize in 3d (CA-3)', () => {
  it('sets the perspective aspect from the canvas', async () => {
    const { game } = await readyGame({ width: 800, height: 400 })
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    expect((game.camera as THREE.PerspectiveCamera).aspect).toBeCloseTo(2)
  })

  it('keeps the letterbox viewport and scissor and takes the aspect from the letterboxed size', async () => {
    const { game } = await readyGame({ width: 800, height: 300, resolution: { width: 640, height: 360 } })
    const renderer = lastFakeRenderer()
    const viewport = vi.spyOn(renderer, 'setViewport')
    const scissor = vi.spyOn(renderer, 'setScissor')
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    ;(game as unknown as { resize(): void }).resize()
    const rect = gameViewport(800, 300, { width: 640, height: 360 })
    expect(viewport).toHaveBeenLastCalledWith(rect.x, rect.y, rect.width, rect.height)
    expect(scissor).toHaveBeenLastCalledWith(rect.x, rect.y, rect.width, rect.height)
    expect((game.camera as THREE.PerspectiveCamera).aspect).toBeCloseTo(640 / 360)
    expect((game.camera as THREE.PerspectiveCamera).projectionMatrix.elements[0]).toBeCloseTo(
      1 / (Math.tan(THREE.MathUtils.degToRad(25)) * (640 / 360)),
    )
  })

  it('neither throws nor changes the perspective camera on game.view and setViewHeight()', async () => {
    const { game } = await readyGame({ viewHeight: 10 })
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    const camera = game.camera as THREE.PerspectiveCamera
    const before = [...camera.projectionMatrix.elements, ...camera.position.toArray()]
    expect(game.view).toBe(10)
    expect(() => game.setViewHeight(40)).not.toThrow()
    expect(game.view).toBe(10)
    expect([...camera.projectionMatrix.elements, ...camera.position.toArray()]).toEqual(before)
  })
})

describe('no 2D ordering in 3d (CA-4)', () => {
  it('draws an unlit 3d scene straight to the canvas: one render, no render target', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({}, PERSPECTIVE), REGISTRY)
    for (let frame = 0; frame < 3; frame += 1) {
      fakeRendering.draws.length = 0
      renderFrame(game)
      expect(fakeRendering.draws).toHaveLength(1)
      expect(fakeRendering.draws[0]).toMatchObject({ scene: game.scene, target: null, camera: game.camera })
    }
    expect(fakeRendering.renderTargets).toEqual([])
  })

  it('never builds the light-map for a 3d scene that declares an Ambient Light', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({ lighting: { ambient: { color: '#334455', intensity: 0.4 } } }, PERSPECTIVE), REGISTRY)
    fakeRendering.draws.length = 0
    renderFrame(game)
    expect(fakeRendering.draws).toHaveLength(1)
    expect(fakeRendering.draws[0]?.target).toBeNull()
    expect(fakeRendering.renderTargets).toEqual([])
  })

  it('still draws through the post target when render.post is on', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({ post: { vignette: { intensity: 0.3, radius: 0.5 } } }, PERSPECTIVE), REGISTRY)
    fakeRendering.draws.length = 0
    renderFrame(game)
    expect(fakeRendering.renderTargets).toHaveLength(1)
    expect(fakeRendering.draws.some((draw) => draw.target !== null)).toBe(true)
  })

})

describe('no 2D ordering in 3d, projection and sort (CA-4)', () => {
  it('applies neither the isometric projection nor y-sort, whatever the render block says', async () => {
    const { game } = await readyGame()
    loadScene(game, threeD({ projection: 'isometric', sort: 'y' }, PERSPECTIVE), REGISTRY)
    expect(game.projection).toBeNull()
    const entity = game.spawn('Probe')
    entity.position.set(3, 4, 5)
    renderFrame(game)
    expect(entity.node.position.toArray()).toEqual([3, 4, 5])
  })

  it('changes nothing in a 2d scene: the lit path still builds its light-map', async () => {
    const { game } = await readyGame()
    loadScene(game, { waicaScene: 3, render: { lighting: { ambient: { intensity: 0.4 } } }, entities: [] }, REGISTRY)
    renderFrame(game)
    expect(fakeRendering.renderTargets.length).toBeGreaterThan(0)
  })
})

describe('transform JSON (CA-5)', () => {
  it('places an entity at a 3-number position and applies rotation (degrees, XYZ) and scale to its node', async () => {
    const { game } = await readyGame()
    const entity = spawnFromJson(game, { name: 'Box', position: [1, 2, 3], rotation: [90, 0, 180], scale: [2, 3, 4] }, REGISTRY)
    expect(entity.position.toArray()).toEqual([1, 2, 3])
    const { x, y, z, order } = entity.node.rotation
    expect(THREE.MathUtils.radToDeg(x)).toBeCloseTo(90, 6)
    expect(THREE.MathUtils.radToDeg(y)).toBeCloseTo(0, 6)
    expect(THREE.MathUtils.radToDeg(z)).toBeCloseTo(180, 6)
    expect(order).toBe('XYZ')
    expect(entity.node.scale.toArray()).toEqual([2, 3, 4])
  })

  it('treats a 2-number position exactly as before: z is 0, no rotation, unit scale', async () => {
    const { game } = await readyGame()
    const entity = spawnFromJson(game, { name: 'Flat', position: [5, 6] }, REGISTRY)
    expect(entity.position.toArray()).toEqual([5, 6, 0])
    expect(entity.node.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
    expect(entity.node.scale.toArray()).toEqual([1, 1, 1])
  })

  it('leaves an entity without a position at the origin', async () => {
    const { game } = await readyGame()
    expect(spawnFromJson(game, { name: 'Nowhere' }, REGISTRY).position.toArray()).toEqual([0, 0, 0])
  })
})

describe('game.worldToScreen (CA-6)', () => {
  it('reproduces the orthographic formula inside the canvas, letterbox offset included', async () => {
    const { game, width, height } = await readyGame({ width: 900, height: 360, resolution: { width: 640, height: 360 } })
    loadScene(game, { waicaScene: 3, camera: { position: [2, 1], zoom: 12 }, entities: [] }, REGISTRY)
    const view = gameViewport(width, height, { width: 640, height: 360 })
    const camera = game.camera as THREE.OrthographicCamera
    for (const [x, y] of [[2, 1], [0, 0], [-3.5, 4], [8, -2]] as const) {
      const nx = (x - (camera.position.x + camera.left)) / (camera.right - camera.left)
      const ny = (camera.position.y + camera.top - y) / (camera.top - camera.bottom)
      const screen = defined(game.worldToScreen({ x, y }))
      expect(screen.x).toBeCloseTo(view.x + nx * view.width)
      expect(screen.y).toBeCloseTo(view.y + ny * view.height)
    }
    expect(defined(game.worldToScreen({ x: 2, y: 1 })).x).toBeCloseTo(450)
  })

})

describe('game.worldToScreen, perspective (CA-6)', () => {
  it('projects through the perspective camera, and is null behind it', async () => {
    const { game } = await readyGame({ width: 640, height: 360 })
    loadScene(game, threeD({}, { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 }), REGISTRY)
    const centre = defined(game.worldToScreen({ x: 0, y: 0, z: 0 }))
    expect(centre.x).toBeCloseTo(320)
    expect(centre.y).toBeCloseTo(180)
    const right = defined(game.worldToScreen({ x: 2, y: 0, z: 0 }))
    expect(right.x).toBeGreaterThan(320)
    expect(right.y).toBeCloseTo(180)
    expect(game.worldToScreen({ x: 0, y: 0, z: 30 })).toBeNull()
  })
})
