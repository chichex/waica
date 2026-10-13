// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { RigidBody, type SceneCameraJson, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'

// Issue #181 CA-12 (camera-relative walking) and CA-13 (run).

use3dTestEnvironment()

const BINDINGS = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space'], run: ['ShiftLeft'] }
const FOLLOW_AT_90: SceneCameraJson = { kind: 'perspective', follow: 'Player', yaw: 90 }

function player(motor: Record<string, unknown> = {}): SceneEntityJson {
  return {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'CharacterMotor', props: motor },
    ],
  }
}

async function playground(motor: Record<string, unknown>, camera?: SceneCameraJson, bindings: Record<string, string[]> = BINDINGS): Promise<PhysicsFixture> {
  const fixture = await physicsFixture([FLOOR, player(motor)], { components: { CharacterMotor }, game: { bindings }, camera })
  fixture.step(20)
  return fixture
}

const where = (fixture: PhysicsFixture): { x: number; z: number } => {
  const { x, z } = defined(fixture.game.find('Player')).position
  return { x, z }
}

/** How far the Player moves on x and z while `actions` are held for `frames` steps. */
function moved(fixture: PhysicsFixture, actions: string[], frames: number): { dx: number; dz: number } {
  const start = where(fixture)
  for (const action of actions) fixture.bridge.control({ operation: 'hold', action })
  fixture.step(frames)
  for (const action of actions) fixture.bridge.control({ operation: 'release', action })
  const end = where(fixture)
  return { dx: end.x - start.x, dz: end.z - start.z }
}

it('walks away from a following camera at yaw 90: up goes toward +x and the yaw turns toward the walk (CA-12)', async () => {
  const fixture = await playground({ relativeTo: 'camera' }, FOLLOW_AT_90)

  const { dx, dz } = moved(fixture, ['up'], 30)

  expect(dx).toBeGreaterThan(3 * 0.95)
  expect(Math.abs(dz)).toBeLessThan(0.05)
  expect(defined(fixture.game.find('Player')).node.rotation.y).toBeCloseTo(Math.PI / 2, 2)
})

it('rotates every direction by the camera yaw: right walks toward +z at yaw 90 (CA-12)', async () => {
  const fixture = await playground({ relativeTo: 'camera' }, FOLLOW_AT_90)

  const { dx, dz } = moved(fixture, ['right'], 30)

  expect(dz).toBeGreaterThan(3 * 0.95)
  expect(Math.abs(dx)).toBeLessThan(0.05)
})

it('keeps walking on the world axes with relativeTo world, or with no following camera (CA-12)', async () => {
  const world = await playground({}, FOLLOW_AT_90)
  const unfollowed = await playground({ relativeTo: 'camera' })

  for (const fixture of [world, unfollowed]) {
    const { dx, dz } = moved(fixture, ['up'], 30)
    expect(dz).toBeLessThan(-3 * 0.95)
    expect(Math.abs(dx)).toBeLessThan(0.05)
  }
  expect(CharacterMotor.params.relativeTo).toEqual({ label: 'Relative to', options: ['world', 'camera'] })
})

it('walks at runSpeed while run is held on the ground (CA-13)', async () => {
  const fixture = await playground({})

  const walking = moved(fixture, ['right'], 60)
  const running = moved(fixture, ['right', 'run'], 60)

  expect(walking.dx).toBeGreaterThan(6 * 0.95)
  expect(walking.dx).toBeLessThan(6 * 1.05)
  expect(running.dx).toBeGreaterThan(10 * 0.95)
  expect(running.dx).toBeLessThan(10 * 1.05)
})

it('runs only on the ground, and an unbound run Action changes nothing (CA-13)', async () => {
  const fixture = await playground({ runSpeed: 12 })
  fixture.bridge.control({ operation: 'hold', action: 'run' })
  fixture.bridge.control({ operation: 'hold', action: 'right' })
  fixture.bridge.control({ operation: 'press', action: 'jump' })
  fixture.step(5)
  const body = defined(defined(fixture.game.find('Player')).get(RigidBody))
  expect(body.grounded).toBe(false)
  expect(Math.hypot(body.desiredVelocity.x, body.desiredVelocity.z)).toBeCloseTo(6, 6)

  // The run key held down for real, with no Action bound to it: the walk speed stays.
  const withoutRun = Object.fromEntries(Object.entries(BINDINGS).filter(([action]) => action !== 'run'))
  const unbound = await playground({}, undefined, withoutRun)
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }))
  const walked = moved(unbound, ['right'], 60).dx
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }))
  expect(walked).toBeGreaterThan(6 * 0.95)
  expect(walked).toBeLessThan(6 * 1.05)
})
