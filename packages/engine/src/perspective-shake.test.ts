// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { fakeRendering } from './test-renderer.js'
import type { Game } from './game.js'
import { loadScene, type SceneJson } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'

// Issue #181 CA-11 (D-1): Camera Effects shake moves a perspective camera too.

use3dTestEnvironment()

interface DrawnFrame {
  /** Where the world origin (the look point) lands on screen, in normalized device coordinates. */
  origin: [number, number]
  position: [number, number, number]
}

/** Shakes `scene`'s camera and records, per drawn frame, the origin on screen and the camera's position. */
async function shakenFrames(scene: SceneJson): Promise<{ game: Game; frames: DrawnFrame[] }> {
  const { game } = await ready3dGame()
  const bridge = runtimeBridgeOf(game)
  loadScene(game, scene, registryOf({}))
  const frames: DrawnFrame[] = []
  fakeRendering.onRender = (_scene, camera) => {
    if (!(camera instanceof THREE.Camera)) return
    // What three's renderer does before drawing a camera without a parent.
    camera.updateMatrixWorld()
    const at = new THREE.Vector3(0, 0, 0).project(camera)
    frames.push({ origin: [at.x, at.y], position: [camera.position.x, camera.position.y, camera.position.z] })
  }
  game.cameraEffects.shake({ intensity: 1.5, seconds: 1 })
  bridge.control({ operation: 'step', frames: 4 })
  fakeRendering.onRender = null
  return { game, frames }
}

const FIXED_3D = scene3d([], {}, { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 })
const FLAT_2D: SceneJson = { waicaScene: 3, entities: [] }

it('moves the image of the look point by the same amount as the same shake in 2D (CA-11)', async () => {
  const flat = await shakenFrames(FLAT_2D)
  const deep = await shakenFrames(FIXED_3D)

  expect(deep.frames).toHaveLength(flat.frames.length)
  expect(flat.frames.some((frame) => frame.origin[0] !== 0 || frame.origin[1] !== 0)).toBe(true)
  deep.frames.forEach((frame, index) => {
    const twin = flat.frames[index]?.origin ?? [Number.NaN, Number.NaN]
    expect(frame.origin[0]).toBeCloseTo(twin[0], 6)
    expect(frame.origin[1]).toBeCloseTo(twin[1], 6)
  })
})

it('offsets the perspective camera along its own right and up, in world units at the look point’s depth (CA-11)', async () => {
  const { game, frames } = await shakenFrames(FIXED_3D)
  const { shake } = game.cameraEffects.state
  const perUnit = (2 * 10 * Math.tan(Math.PI / 6)) / game.view

  const last = frames.at(-1)
  expect(last?.position[0]).toBeCloseTo(shake.x * perUnit, 6)
  expect(last?.position[1]).toBeCloseTo(shake.y * perUnit, 6)
  expect(last?.position[2]).toBeCloseTo(10, 6)
  expect([game.camera.position.x, game.camera.position.y, game.camera.position.z]).toEqual([0, 0, 10])
})

it('reports the shake offset in a 3d scene’s snapshot, as in 2d (CA-11)', async () => {
  const { game } = await ready3dGame()
  const bridge = runtimeBridgeOf(game)
  loadScene(game, FIXED_3D, registryOf({}))
  game.cameraEffects.shake({ intensity: 2, seconds: 1 })
  bridge.control({ operation: 'step', frames: 3 })

  expect(game.cameraEffects.state.shake).not.toEqual({ x: 0, y: 0 })
  expect(bridge.inspect().camera.shake).toEqual(game.cameraEffects.state.shake)
})
