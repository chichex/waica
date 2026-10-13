// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { authoringDefaults, componentSpaceOf, StateMachine, type SceneComponentJson, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'
import { Health } from './health.js'
import { MeleeAttack } from './melee-attack.js'

// Issue #181 CA-16 (the 3D strike) and CA-17 (knockback).

use3dTestEnvironment()

/** A capsule standing on the floor at (x, z), on `layer`, with a Health of 3 and whatever `extra` adds. */
function body(name: string, at: { x: number; z: number; layer: string }, extra: SceneComponentJson[] = []): SceneEntityJson {
  const { x, z, layer } = at
  return {
    name,
    position: [x, 0.9, z],
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8, layer, collidesWith: layer === 'player' ? ['enemy'] : ['player'] } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'Health', props: { max: 3 } },
      ...extra,
    ],
  }
}

const HERO = body('Hero', { x: 0, z: 0, layer: 'player' }, [{ type: 'MeleeAttack', props: { range: 1.5, width: 1 } }])

async function arena(entities: SceneEntityJson[]): Promise<PhysicsFixture> {
  // Health updates after StateMachine, so the schedule needs it registered.
  const fixture = await physicsFixture([FLOOR, HERO, ...entities], { components: { MeleeAttack, Health, CharacterMotor, StateMachine } })
  fixture.step(10)
  return fixture
}

const healthOf = (fixture: PhysicsFixture, name: string): number => defined(defined(fixture.game.find(name)).get(Health)).current
const strike = (fixture: PhysicsFixture): string[] =>
  defined(defined(fixture.game.find('Hero')).get(MeleeAttack)).strike().map((entity) => entity.name)

it('declares both spaces and a height used only in 3D (CA-16)', () => {
  expect(componentSpaceOf(MeleeAttack)).toBe('both')
  expect(authoringDefaults(MeleeAttack)).toMatchObject({ damage: 1, range: 1, width: 1, height: 2, knockbackSpeed: 8 })
})

it('damages a target in front of the attacker’s yaw and not one behind it (CA-16)', async () => {
  const fixture = await arena([body('Front', { x: 0, z: 1.2, layer: 'enemy' }), body('Behind', { x: 0, z: -1.2, layer: 'enemy' })])

  expect(strike(fixture)).toEqual(['Front'])
  expect([healthOf(fixture, 'Hero'), healthOf(fixture, 'Front'), healthOf(fixture, 'Behind')]).toEqual([3, 2, 3])

  defined(fixture.game.find('Hero')).node.rotation.y = Math.PI
  fixture.step(20)
  expect(strike(fixture)).toEqual(['Behind'])
})

it('anchors the box on the attacker’s collider, so a low target in front is hit whatever the origin (CA-16)', async () => {
  // A slime 0.6 tall standing in front: the Hero's capsule is centred on its origin at y 0.9, so a box from the origin up would pass over it.
  const slime: SceneEntityJson = {
    name: 'Slime',
    position: [0, 0.3, 1.2],
    components: [
      { type: 'Collider', props: { shape: 'box', size: [0.8, 0.6, 0.8], layer: 'enemy', collidesWith: ['player'] } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'Health', props: { max: 3 } },
    ],
  }
  const fixture = await arena([slime])

  expect(strike(fixture)).toEqual(['Slime'])
})

it('reaches range forward and width across, and respects the attacker’s collision mask (CA-16)', async () => {
  const fixture = await arena([
    body('Far', { x: 0, z: 2.4, layer: 'enemy' }),
    body('Wide', { x: 1.4, z: 0.8, layer: 'enemy' }),
    body('Friend', { x: 0, z: 1.2, layer: 'player' }),
  ])

  expect(strike(fixture)).toEqual([])
  expect(healthOf(fixture, 'Friend')).toBe(3)
})

it('pushes the hit body’s CharacterMotor away from the attacker at knockbackSpeed for 0.15 s (CA-17)', async () => {
  const fixture = await arena([body('Front', { x: 0, z: 1.2, layer: 'enemy' }, [{ type: 'CharacterMotor' }])])
  const front = defined(fixture.game.find('Front'))
  const start = front.position.z

  expect(strike(fixture)).toEqual(['Front'])
  fixture.step(30)

  expect(front.position.z - start).toBeCloseTo(8 * 0.15, 1)
  expect(Math.abs(front.position.x)).toBeLessThan(1e-3)
})

it('lets a wall stop the push (CA-17)', async () => {
  const wall: SceneEntityJson = { name: 'Wall', position: [0, 1, 2], components: [{ type: 'Collider', props: { size: [4, 2, 0.2] } }] }
  const fixture = await arena([body('Front', { x: 0, z: 1.2, layer: 'enemy' }, [{ type: 'CharacterMotor' }]), wall])

  strike(fixture)
  fixture.step(30)

  expect(defined(fixture.game.find('Front')).position.z).toBeLessThan(2 - 0.1 - 0.4 + 0.02)
})
