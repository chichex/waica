// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Component, componentSpaceOf, installArchetype, RigidBody, StateMachine, type SceneComponentJson, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { Chaser } from './chaser.js'
import { Patrol } from './patrol.js'

// Issue #181 CA-19: Patrol and Chaser in a 3D scene, through the kinematic body.

use3dTestEnvironment()
beforeEach(() => installArchetype({ roles: { player: { description: 'The prey Chaser looks for.', states: {} } } }))

/** Steps the entity's Patrol or Chaser every Simulation Step, as their roles' states do. */
class Driver extends Component {
  static override componentName = 'Driver'
  override onUpdate(dt: number): void {
    this.entity.get(Patrol)?.step(dt)
    this.entity.get(Chaser)?.step(dt)
  }
}

function walker(name: string, at: [number, number], driver: SceneComponentJson): SceneEntityJson {
  return {
    name,
    position: [at[0], 0.9, at[1]],
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      driver,
      { type: 'Driver' },
    ],
  }
}

/** A player by role, which is how Chaser finds its prey. */
const prey = (at: [number, number]): SceneEntityJson => ({
  name: 'Player',
  position: [at[0], 0.9, at[1]],
  components: [{ type: 'StateMachine', props: { role: 'player', states: { idle: {} } } }],
})

async function arena(entities: SceneEntityJson[]): Promise<PhysicsFixture> {
  const fixture = await physicsFixture([FLOOR, ...entities], { components: { Patrol, Chaser, Driver, StateMachine } })
  fixture.step(1)
  return fixture
}

/** The x and z of `name` after each of `frames` steps. */
function track(fixture: PhysicsFixture, name: string, frames: number): Array<{ x: number; z: number }> {
  const entity = defined(fixture.game.find(name))
  const seen: Array<{ x: number; z: number }> = []
  for (let frame = 0; frame < frames; frame += 1) {
    fixture.step(1)
    seen.push({ x: entity.position.x, z: entity.position.z })
  }
  return seen
}

it('runs in both spaces: Patrol and Chaser carry no space marker (CA-19)', () => {
  expect(componentSpaceOf(Patrol)).toBe('both')
  expect(componentSpaceOf(Chaser)).toBe('both')
})

it('paces a horizontal Patrol on x between origin ± distance through desired velocity, turning its yaw (CA-19)', async () => {
  const fixture = await arena([walker('Rat', [1, 0], { type: 'Patrol', props: { axis: 'horizontal', distance: 2, speed: 4 } })])
  const rat = defined(fixture.game.find('Rat'))

  const seen = track(fixture, 'Rat', 150)

  const xs = seen.map(({ x }) => x)
  expect(Math.max(...xs)).toBeGreaterThan(3 - 0.1)
  expect(Math.max(...xs)).toBeLessThan(3 + 0.1)
  expect(Math.min(...xs)).toBeLessThan(-1 + 0.1)
  expect(Math.min(...xs)).toBeGreaterThan(-1 - 0.1)
  expect(seen.every(({ z }) => Math.abs(z) < 1e-3)).toBe(true)
  const body = defined(rat.get(RigidBody))
  expect(Math.abs(body.desiredVelocity.x)).toBeCloseTo(4, 6)
  expect(Math.abs(rat.node.rotation.y)).toBeCloseTo(Math.PI / 2, 2)
})

it('maps a vertical Patrol to z, never y (CA-19)', async () => {
  const fixture = await arena([walker('Bat', [0, 0], { type: 'Patrol', props: { axis: 'vertical', distance: 1.5, speed: 3 } })])

  const seen = track(fixture, 'Bat', 120)

  expect(Math.max(...seen.map(({ z }) => z))).toBeGreaterThan(1.4)
  expect(Math.min(...seen.map(({ z }) => z))).toBeLessThan(-1.4)
  expect(seen.every(({ x }) => Math.abs(x) < 1e-3)).toBe(true)
  expect(defined(fixture.game.find('Bat')).position.y).toBeCloseTo(0.9, 1)
})

it('walks a Chaser straight at the player on xz when it is inside range, whatever its mode (CA-19)', async () => {
  const fixture = await arena([walker('Ghoul', [0, 0], { type: 'Chaser', props: { mode: 'ghost', range: 6, speed: 3 } }), prey([3, 4])])

  const seen = track(fixture, 'Ghoul', 30)

  const end = defined(seen.at(-1))
  expect(Math.hypot(end.x, end.z)).toBeCloseTo(1.5, 1)
  expect(end.z / end.x).toBeCloseTo(4 / 3, 2)
  expect(defined(fixture.game.find('Ghoul')).position.y).toBeCloseTo(0.9, 1)
})

it('stands still while the player is out of range (CA-19)', async () => {
  const fixture = await arena([walker('Ghoul', [0, 0], { type: 'Chaser', props: { range: 4 } }), prey([4, 4])])

  const seen = track(fixture, 'Ghoul', 30)

  expect(seen.every(({ x, z }) => Math.abs(x) < 1e-3 && Math.abs(z) < 1e-3)).toBe(true)
})

it('lets a wall stop a Chaser (CA-19)', async () => {
  const wall: SceneEntityJson = { name: 'Wall', position: [0, 1, 2], components: [{ type: 'Collider', props: { size: [6, 2, 0.2] } }] }
  const fixture = await arena([walker('Ghoul', [0, 0], { type: 'Chaser', props: { range: 10, speed: 4 } }), prey([0, 5]), wall])

  const seen = track(fixture, 'Ghoul', 90)

  expect(defined(seen.at(-1)).z).toBeLessThan(2 - 0.1 - 0.4 + 0.02)
})
