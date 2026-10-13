// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { Game } from './game.js'
import type { RuntimeBridge } from './runtime-bridge.js'
import { loadScene } from './scene.js'
import type { PerspectiveSceneCameraJson } from './scene-camera-3d.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { defined } from './test-support.js'

// Issue #181 CA-7 (the lock click), CA-8 (wheel zoom) and CA-10 (the snapshot's view).

use3dTestEnvironment()

afterEach(() => {
  Reflect.deleteProperty(document, 'pointerLockElement')
})

async function sceneWith(camera: PerspectiveSceneCameraJson): Promise<{ game: Game; bridge: RuntimeBridge; canvas: HTMLCanvasElement }> {
  const { game } = await ready3dGame()
  const bridge = runtimeBridgeOf(game)
  loadScene(game, scene3d([{ name: 'Player', position: [1, 0, -2] }], {}, camera), registryOf({}))
  return { game, bridge, canvas: defined(document.querySelector('canvas')) }
}

function stubLock(canvas: HTMLCanvasElement): () => number {
  let locked: Element | null = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
  const request = vi.fn(() => {
    locked = canvas
    return Promise.resolve()
  })
  Object.defineProperty(canvas, 'requestPointerLock', { configurable: true, value: request })
  return () => request.mock.calls.length
}

function click(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
}

function wheel(canvas: HTMLCanvasElement, deltaY: number): void {
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true, bubbles: true }))
}

it('asks for the pointer lock on a canvas click while simulating a following camera (CA-7)', async () => {
  const following = await sceneWith({ kind: 'perspective', follow: 'Player' })
  const requests = stubLock(following.canvas)
  following.game.simulate = false
  click(following.canvas)
  expect(requests()).toBe(0)

  following.game.simulate = true
  click(following.canvas)
  expect(requests()).toBe(1)
})

it('never asks for the lock under a fixed perspective camera (CA-7)', async () => {
  const fixed = await sceneWith({ kind: 'perspective', position: [0, 4, 8] })
  const requests = stubLock(fixed.canvas)

  click(fixed.canvas)

  expect(requests()).toBe(0)
})

it('zooms the chosen distance by the step’s wheel, clamped to [minDistance, maxDistance] (CA-8)', async () => {
  const { bridge, canvas } = await sceneWith({ kind: 'perspective', follow: 'Player', distance: 5, minDistance: 3, maxDistance: 9 })
  const distance = (): unknown => Reflect.get(bridge.inspect().view, 'distance')

  wheel(canvas, 150)
  bridge.control({ operation: 'step' })
  expect(distance()).toBe(6.5)
  wheel(canvas, -100)
  wheel(canvas, -900)
  bridge.control({ operation: 'step' })
  expect(distance()).toBe(3)
  wheel(canvas, 5000)
  bridge.control({ operation: 'step' })
  expect(distance()).toBe(9)
})

it('adds follow, yaw, pitch, distance and distanceActual to a following camera’s snapshot view (CA-10)', async () => {
  const { bridge } = await sceneWith({ kind: 'perspective', follow: 'Player', yaw: 45, pitch: 30, distance: 4, lookHeight: 1 })
  bridge.control({ operation: 'step' })

  const view = bridge.inspect().view
  expect(view).toMatchObject({ kind: 'perspective', follow: 'Player', yaw: 45, pitch: 30, distance: 4, distanceActual: 4, fov: 60 })
  expect(Object.keys(view).sort()).toEqual(['distance', 'distanceActual', 'follow', 'fov', 'kind', 'pitch', 'position', 'target', 'yaw'])
  if (view.kind !== 'perspective') throw new Error('expected a perspective view')
  view.target.forEach((value, axis) => expect(value).toBeCloseTo([1, 1, -2][axis] ?? Number.NaN, 5))
})

it('keeps the fixed camera’s snapshot view as it was (CA-10)', async () => {
  const { bridge } = await sceneWith({ kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0] })
  bridge.control({ operation: 'step' })

  expect(bridge.inspect().view).toEqual({ kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60 })
})
