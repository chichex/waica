// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, componentSpaceOf, GltfModelBackend, installArchetype, Model, RigidBody, StateMachine, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { RIG_URL, serveRig } from '../../engine/src/test-rig.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'
import { CHARACTER_ROLE, CHARACTER_STATE_GRAPH } from './character-states.js'
import { Checkpoint } from './checkpoint.js'
import { Health } from './health.js'
import { Respawnable } from './respawnable.js'

// Issue #181 CA-21: checkpoints and the 3D respawn.

use3dTestEnvironment()
beforeEach(() => installArchetype({ roles: { player: CHARACTER_ROLE } }))
afterEach(() => {
  vi.unstubAllGlobals()
})

const BINDINGS = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space'], dodge: ['KeyC'] }
const { initial, states } = CHARACTER_STATE_GRAPH

const PLAYER: SceneEntityJson = {
  name: 'Player',
  position: [0, 0.9, 0],
  components: [
    { type: 'Model', props: { src: RIG_URL } },
    { type: 'Animator', props: { fade: 0, clips: { jump: { loop: false } } } },
    { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'CharacterMotor' },
    { type: 'Health', props: { max: 6 } },
    { type: 'Respawnable' },
    // The rig has no death clip: the die state plays jump once.
    { type: 'StateMachine', props: { role: 'player', initial, states: { ...states, die: { ...states.die, clip: 'jump' } } } },
  ],
}

const checkpoint = (name: string, x: number): SceneEntityJson => ({
  name,
  position: [x, 1, 0],
  components: [{ type: 'Collider', props: { size: [1, 2, 2], sensor: true } }, { type: 'Checkpoint' }],
})

async function course(): Promise<PhysicsFixture> {
  serveRig()
  const fixture = await physicsFixture([FLOOR, PLAYER, checkpoint('First', 3), checkpoint('Second', 6)], {
    components: { Model, Animator, StateMachine, CharacterMotor, Health, Respawnable, Checkpoint },
    game: { bindings: BINDINGS, models: new GltfModelBackend() },
  })
  fixture.step(20)
  return fixture
}

const player = (fixture: PhysicsFixture) => defined(fixture.game.find('Player'))
const isActive = (fixture: PhysicsFixture, name: string): boolean => defined(defined(fixture.game.find(name)).get(Checkpoint)).active

/** Walks the Player right until its x passes `x`. */
function walkPast(fixture: PhysicsFixture, x: number): void {
  fixture.bridge.control({ operation: 'hold', action: 'right' })
  for (let frame = 0; frame < 240 && player(fixture).position.x < x; frame += 1) fixture.step(1)
  fixture.bridge.control({ operation: 'release', action: 'right' })
  fixture.step(10)
}

it('runs in both spaces (CA-21)', () => {
  expect(componentSpaceOf(Checkpoint)).toBe('both')
})

it('activates when the player enters its sensor and makes it the respawn point, the last one winning (CA-21)', async () => {
  const fixture = await course()
  expect([isActive(fixture, 'First'), isActive(fixture, 'Second')]).toEqual([false, false])

  walkPast(fixture, 3.5)
  expect([isActive(fixture, 'First'), isActive(fixture, 'Second')]).toEqual([true, false])
  walkPast(fixture, 6.5)
  expect([isActive(fixture, 'First'), isActive(fixture, 'Second')]).toEqual([false, true])

  player(fixture).position.set(-4, 0.9, 2)
  defined(player(fixture).get(Respawnable)).respawn()
  fixture.step(2)
  expect(player(fixture).position.x).toBeCloseTo(6, 1)
  expect(player(fixture).position.z).toBeCloseTo(0, 1)
})

it('teleports the kinematic body home and halts a rolling CharacterMotor (CA-21)', async () => {
  const fixture = await course()
  fixture.bridge.control({ operation: 'press', action: 'dodge' })
  fixture.step(3)
  const motor = defined(player(fixture).get(CharacterMotor))
  expect(motor.rolling).toBe(true)

  defined(player(fixture).get(Respawnable)).respawn()

  expect(motor.rolling).toBe(false)
  expect(defined(player(fixture).get(RigidBody)).desiredVelocity).toEqual({ x: 0, z: 0 })
  fixture.step(1)
  expect(player(fixture).position.x).toBeCloseTo(0, 1)
})

it('plays die, fades out, respawns at the checkpoint with full health and fades back in (CA-21)', async () => {
  const fixture = await course()
  walkPast(fixture, 3.5)
  const health = defined(player(fixture).get(Health))
  health.damage(Number.POSITIVE_INFINITY)
  fixture.step(2)
  expect(defined(player(fixture).get(StateMachine)).current).toBe('die')

  let darkest = 0
  for (let frame = 0; frame < 120; frame += 1) {
    fixture.step(1)
    darkest = Math.max(darkest, fixture.game.cameraEffects.state.fade.opacity)
  }

  expect(darkest).toBe(1)
  expect(fixture.game.cameraEffects.state.fade.opacity).toBe(0)
  expect(health.current).toBe(6)
  expect(player(fixture).position.x).toBeCloseTo(3, 1)
  expect(defined(player(fixture).get(StateMachine)).current).toBe('idle')
})
