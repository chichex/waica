// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { authoringDefaults, Component, RigidBody, StateMachine, type SceneComponentJson, type SceneEntityJson, type SceneRegistry } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'
import { Health } from './health.js'
import { knockBackFrom } from './knockback-3d.js'

// Issue #181 CA-14: the roll.

use3dTestEnvironment()

const BINDINGS = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space'], dodge: ['KeyC'] }

async function playground(extra: SceneComponentJson[] = [], components: SceneRegistry['components'] = {}): Promise<PhysicsFixture> {
  const entity: SceneEntityJson = {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'CharacterMotor' },
      ...extra,
    ],
  }
  // Health updates after StateMachine, so the schedule needs it registered.
  const fixture = await physicsFixture([FLOOR, entity], { components: { CharacterMotor, Health, StateMachine, ...components }, game: { bindings: BINDINGS } })
  fixture.step(20)
  return fixture
}

const motorOf = (fixture: PhysicsFixture): CharacterMotor => defined(defined(fixture.game.find('Player')).get(CharacterMotor))
const where = (fixture: PhysicsFixture): { x: number; z: number } => {
  const { x, z } = defined(fixture.game.find('Player')).position
  return { x, z }
}
const act = (fixture: PhysicsFixture, operation: 'press' | 'hold' | 'release', action: string): void => {
  fixture.bridge.control({ operation, action })
}

it('declares the roll params with their defaults (CA-14)', () => {
  expect(authoringDefaults(CharacterMotor)).toMatchObject({ dodgeAction: 'dodge', dodgeSpeed: 10, dodgeDuration: 0.5, dodgeCooldown: 0.8 })
})

it('rolls along the facing at dodgeSpeed for dodgeDuration when there is no input (CA-14)', async () => {
  const fixture = await playground()
  const start = where(fixture)

  act(fixture, 'press', 'dodge')
  fixture.step(1)
  expect(motorOf(fixture).rolling).toBe(true)
  fixture.step(29)
  expect(motorOf(fixture).rolling).toBe(false)

  const end = where(fixture)
  expect(end.z - start.z).toBeGreaterThan(5 * 0.9)
  expect(end.z - start.z).toBeLessThan(5 * 1.05)
  expect(Math.abs(end.x - start.x)).toBeLessThan(0.05)
})

it('rolls along the input direction and ignores other movement input meanwhile (CA-14)', async () => {
  const fixture = await playground()
  const start = where(fixture)

  act(fixture, 'hold', 'right')
  act(fixture, 'press', 'dodge')
  fixture.step(3)
  act(fixture, 'release', 'right')
  act(fixture, 'hold', 'left')
  fixture.step(20)

  const end = where(fixture)
  expect(end.x - start.x).toBeGreaterThan(10 * (23 / 60) * 0.9)
  expect(Math.abs(end.z - start.z)).toBeLessThan(0.05)
})

it('opens the Health window for dodgeDuration without blinking (CA-14)', async () => {
  const fixture = await playground([{ type: 'Health', props: { max: 3, invulnerability: 1 } }])
  const entity = defined(fixture.game.find('Player'))
  const health = defined(entity.get(Health))

  act(fixture, 'press', 'dodge')
  fixture.step(2)
  health.damage(1)
  expect(health.current).toBe(3)
  expect(health.blinking).toBe(false)
  fixture.step(10)
  expect(entity.node.visible).toBe(true)

  fixture.step(20)
  health.damage(1)
  expect(health.current).toBe(2)
})

/** Records, each step a dodge press is fresh, whether the motor (which updates first) consumed it. */
class DodgeProbe extends Component {
  static override componentName = 'DodgeProbe'
  static override updateAfter: readonly string[] = ['CharacterMotor']
  log: boolean[] = []
  override onUpdate(): void {
    if (this.game.input.justPressed('dodge')) this.log.push(this.game.input.consumed('dodge'))
  }
}

it('consumes the press only when a roll starts: not in the air, not while cooling down (CA-14)', async () => {
  const fixture = await playground([{ type: 'DodgeProbe' }], { DodgeProbe })
  const probe = defined(defined(fixture.game.find('Player')).get(DodgeProbe))
  act(fixture, 'press', 'jump')
  fixture.step(3)
  act(fixture, 'press', 'dodge')
  fixture.step(1)
  expect(motorOf(fixture).rolling).toBe(false)

  fixture.step(80)
  act(fixture, 'press', 'dodge')
  fixture.step(31)
  expect(motorOf(fixture).rolling).toBe(false)
  act(fixture, 'press', 'dodge')
  fixture.step(1)
  expect(motorOf(fixture).rolling).toBe(false)
  fixture.step(48)
  act(fixture, 'press', 'dodge')
  fixture.step(1)
  expect(motorOf(fixture).rolling).toBe(true)
  expect(probe.log).toEqual([false, true, false, true])
})

it('ignores a knockback while it rolls, as its i-frames ignore damage: the roll goes on and no push follows it (CA-14, CA-17)', async () => {
  const fixture = await playground()
  act(fixture, 'press', 'dodge')
  fixture.step(3)
  const motor = motorOf(fixture)
  expect(motor.rolling).toBe(true)
  const player = defined(fixture.game.find('Player'))
  const body = defined(player.get(RigidBody))
  const rollVelocity = { ...body.desiredVelocity }
  const pusher = fixture.game.spawn('Pusher')
  pusher.position.set(player.position.x + 1, player.position.y, player.position.z)

  knockBackFrom(player, pusher, 8)
  fixture.step(2)
  expect(motor.rolling).toBe(true)
  expect(body.desiredVelocity).toEqual(rollVelocity)
  fixture.step(40)

  expect(motor.rolling).toBe(false)
  expect(Math.hypot(body.desiredVelocity.x, body.desiredVelocity.z)).toBe(0)
})
