// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { SceneCameraJson } from './camera.js'
import { Model } from './components/model.js'
import type { Game } from './game.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { fakeRendering } from './test-renderer.js'
import { renderFrame } from './test-sprite-batches.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

afterEach(() => {
  vi.restoreAllMocks()
})

const SCENE_CAMERA: SceneCameraJson = { kind: 'perspective', position: [0, 4, 12], target: [0, 1, 0], fov: 50 }

async function game3d(): Promise<Game> {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([{ name: 'Crate', position: [2, 0, 0], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] }], {}, SCENE_CAMERA), registryOf({ Model }))
  return game
}

/** An editor-style camera somewhere else than the scene camera, looking at the origin. */
function viewCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 500)
  camera.position.set(-6, 3, 2)
  camera.lookAt(0, 0, 0)
  return camera
}

/** The camera of the last render call the fake renderer saw. */
function lastDrawnCamera(): unknown {
  return defined(fakeRendering.draws.at(-1), 'a render call').camera
}

describe('a view camera over a 3D scene (issue #173 CA-1)', () => {
  it('is game.camera and the camera every frame draws through, while the scene camera stays the one the JSON placed', async () => {
    const game = await game3d()
    const scene = game.camera
    const view = viewCamera()

    game.cameraRig.setViewCamera(view)
    renderFrame(game)

    expect(game.camera).toBe(view)
    expect(lastDrawnCamera()).toBe(view)
    expect(game.cameraRig.sceneCamera).toBe(scene)
    expect(game.cameraRig.sceneCamera.position.toArray()).toEqual([0, 4, 12])
  })

  it('leaves the view camera alone when the scene camera is re-placed from new JSON', async () => {
    const game = await game3d()
    const view = viewCamera()
    game.cameraRig.setViewCamera(view)

    game.setSceneCamera({ kind: 'perspective', position: [5, 6, 7], target: [0, 0, 0], fov: 40 })

    const scene = game.cameraRig.sceneCamera
    if (!(scene instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective scene camera')
    expect(scene.position.toArray()).toEqual([5, 6, 7])
    expect(scene.fov).toBe(40)
    expect(view.position.toArray()).toEqual([-6, 3, 2])
    expect(view.fov).toBe(70)
    expect(game.camera).toBe(view)
  })
})

describe('clearing or fitting a view camera (issue #173 CA-1)', () => {
  it('restores the scene camera when cleared', async () => {
    const game = await game3d()
    const scene = game.camera
    game.cameraRig.setViewCamera(viewCamera())
    renderFrame(game)

    game.cameraRig.setViewCamera(null)
    renderFrame(game)

    expect(game.camera).toBe(scene)
    expect(lastDrawnCamera()).toBe(scene)
  })

  it('fits the view camera to the viewport and lets it see the Emissive layer, like the scene camera', async () => {
    const game = await game3d()
    const view = viewCamera()

    game.cameraRig.setViewCamera(view)

    expect(view.aspect).toBeCloseTo(640 / 360)
    expect(view.layers.isEnabled(EMISSIVE_LAYER)).toBe(true)
  })

  it('projects and picks through the view camera', async () => {
    const game = await game3d()
    const view = viewCamera()
    const before = defined(game.worldToScreen({ x: 2, y: 1, z: 0 }), 'a visible point')

    game.cameraRig.setViewCamera(view)
    const after = defined(game.worldToScreen({ x: 2, y: 1, z: 0 }), 'a visible point')
    const canvas = defined(document.querySelector('canvas'), 'the game canvas')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: after.x, clientY: after.y, button: 0 }))

    expect(after).not.toEqual(before)
    expect(game.pointer.takePending()?.entity?.name).toBe('Crate')
  })
})

describe('a view camera over a 2D scene (issue #173 CA-1)', () => {
  it('is ignored, with one warning however often it is set', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const orthographic = game.camera

    game.cameraRig.setViewCamera(viewCamera())
    game.cameraRig.setViewCamera(viewCamera())
    renderFrame(game)

    expect(game.camera).toBe(orthographic)
    expect(game.cameraRig.sceneCamera).toBe(orthographic)
    expect(lastDrawnCamera()).toBe(orthographic)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('setViewCamera')
  })
})

describe('a view camera set before the 3D scene arrives (issue #173 CA-1)', () => {
  it('is kept and takes over once a 3D scene loads, whatever the order of the calls', async () => {
    const { game } = await ready3dGame()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = viewCamera()

    game.cameraRig.setViewCamera(view)
    loadScene(game, scene3d([], {}, SCENE_CAMERA), registryOf({}))
    renderFrame(game)

    expect(game.camera).toBe(view)
    expect(lastDrawnCamera()).toBe(view)
  })
})
