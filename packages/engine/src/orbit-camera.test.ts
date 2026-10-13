// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { Game } from './game.js'
import type { RuntimeBridge } from './runtime-bridge.js'
import { loadScene, type SceneEntityJson } from './scene.js'
import type { PerspectiveSceneCameraJson } from './scene-camera-3d.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { defined } from './test-support.js'

// Issue #181 CA-6, CA-7, CA-8, CA-10: the perspective camera that orbits a followed entity.

use3dTestEnvironment()

const BINDINGS = { look_left: ['KeyQ'], look_right: ['KeyE'], look_up: ['KeyR'], look_down: ['KeyF'] }
const PLAYER: SceneEntityJson = { name: 'Player', position: [0, 0, 0] }
const RAD = Math.PI / 180

interface OrbitRun {
  game: Game
  bridge: RuntimeBridge
  step: (frames?: number) => void
  view: () => Record<string, unknown>
}

async function orbitScene(camera: Partial<PerspectiveSceneCameraJson> = {}): Promise<OrbitRun> {
  const { game } = await ready3dGame(undefined, undefined, { bindings: BINDINGS })
  const bridge = runtimeBridgeOf(game)
  const block: PerspectiveSceneCameraJson = { kind: 'perspective', follow: 'Player', ...camera }
  loadScene(game, scene3d([PLAYER], {}, block), registryOf({}))
  return {
    game,
    bridge,
    step: (frames = 1) => {
      bridge.control({ operation: 'step', frames })
    },
    view: () => ({ ...bridge.inspect().view }),
  }
}

function cameraPosition(game: Game): [number, number, number] {
  const { x, y, z } = game.camera.position
  return [x, y, z]
}

function expectNear(actual: readonly number[], expected: readonly number[], digits = 6): void {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, digits))
}

it('sits at distance, yaw and pitch from the followed entity plus lookHeight and looks at that point (CA-6)', async () => {
  const run = await orbitScene()
  run.step()

  const look = new THREE.Vector3(0, 1.2, 0)
  expectNear(cameraPosition(run.game), [0, 1.2 + 6 * Math.sin(20 * RAD), 6 * Math.cos(20 * RAD)])
  const facing = run.game.camera.getWorldDirection(new THREE.Vector3())
  const toLook = look.sub(run.game.camera.position).normalize()
  expectNear([facing.x, facing.y, facing.z], [toLook.x, toLook.y, toLook.z])
})

it('moves once per Simulation Step, never between steps (CA-6)', async () => {
  const run = await orbitScene()
  run.step()
  const before = cameraPosition(run.game)

  defined(run.game.find('Player')).position.x = 3
  // A frame that draws without simulating: the camera must not follow until the next step.
  run.game.simulate = false
  run.step()
  run.game.simulate = true
  expect(cameraPosition(run.game)).toEqual(before)
  run.step()

  expectNear(cameraPosition(run.game), [3, before[1], before[2]])
})

it('sits on its orbit as soon as the scene loads, before the first step (CA-6, CA-10)', async () => {
  const run = await orbitScene({ yaw: 90, distance: 4 })

  expectNear(cameraPosition(run.game), [-4 * Math.cos(20 * RAD), 1.2 + 4 * Math.sin(20 * RAD), 0])
  expect(run.view()).toMatchObject({ distance: 4, distanceActual: 4 })
  expectNear(run.view().target as number[], [0, 1.2, 0], 5)
})

it('keeps the declared pose and its target while the followed entity does not exist (CA-10)', async () => {
  const run = await orbitScene({ follow: 'Nobody', position: [0, 5, 10], target: [0, 0, 0] })
  run.step()

  expect(run.view()).toMatchObject({ position: [0, 5, 10], target: [0, 0, 0] })
})

it('reports the yaw wrapped to (-180, 180], from the scene and after turning (CA-10)', async () => {
  const declared = await orbitScene({ yaw: 270 })
  declared.step()
  expect(declared.view().yaw).toBe(-90)

  const run = await orbitScene()
  run.bridge.control({ operation: 'hold', action: 'look_right' })
  run.step(120)
  expect(run.view().yaw).toBeCloseTo(-120, 6)
})

/** One scripted run of the orbit: mouse looks, an orbit Action, a wheel turn, step by step. */
async function scriptedPositions(): Promise<number[][]> {
  const run = await orbitScene()
  const canvas = defined(document.querySelector('canvas'))
  const positions: number[][] = []
  for (let index = 0; index < 20; index += 1) {
    if (index === 2) run.bridge.control({ operation: 'look', dx: 37, dy: -12 })
    if (index === 5) run.bridge.control({ operation: 'hold', action: 'look_right' })
    if (index === 9) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 140, cancelable: true }))
    if (index === 12) run.bridge.control({ operation: 'release', action: 'look_right' })
    run.step()
    positions.push(cameraPosition(run.game))
  }
  return positions
}

it('gives identical camera positions step by step for the same inputs (CA-6)', async () => {
  const first = await scriptedPositions()
  document.body.innerHTML = ''
  const second = await scriptedPositions()

  expect(second).toEqual(first)
  expect(new Set(first.map((position) => position.join())).size).toBeGreaterThan(5)
})

it('turns yaw by the locked mouse x and pitch by its y times sensitivity; invertY flips y (CA-7)', async () => {
  const run = await orbitScene()
  run.bridge.control({ operation: 'look', dx: 100, dy: 50 })
  run.step()
  expect(run.view()).toMatchObject({ yaw: 20, pitch: 30 })

  const inverted = await orbitScene({ invertY: true, sensitivity: 0.5 })
  inverted.bridge.control({ operation: 'look', dx: -20, dy: 10 })
  inverted.step()
  expect(inverted.view()).toMatchObject({ yaw: -10, pitch: 15 })
})

it('turns at orbitSpeed degrees per second through the orbit Actions (CA-7)', async () => {
  const run = await orbitScene({ orbitSpeed: 90 })
  run.bridge.control({ operation: 'hold', action: 'look_right' })
  run.step(30)
  run.bridge.control({ operation: 'release', action: 'look_right' })
  run.bridge.control({ operation: 'hold', action: 'look_left', value: 0.5 })
  run.step(20)
  run.bridge.control({ operation: 'release', action: 'look_left' })
  run.bridge.control({ operation: 'hold', action: 'look_down' })
  run.step(10)

  const view = run.view()
  expect(view.yaw).toBeCloseTo(45 - 15, 6)
  expect(view.pitch).toBeCloseTo(20 + 15, 6)
})

it('clamps pitch to [minPitch, maxPitch] and holds the orbit without input (CA-7)', async () => {
  const run = await orbitScene({ yaw: 30 })
  run.bridge.control({ operation: 'hold', action: 'look_up' })
  run.step(120)
  expect(run.view()).toMatchObject({ yaw: 30, pitch: -10 })
  run.bridge.control({ operation: 'release', action: 'look_up' })
  run.bridge.control({ operation: 'look', dx: 0, dy: 10_000 })
  run.step()
  expect(run.view()).toMatchObject({ pitch: 70 })

  defined(run.game.find('Player')).position.set(4, 0, -2)
  run.step(60)
  expect(run.view()).toMatchObject({ yaw: 30, pitch: 70 })
})
