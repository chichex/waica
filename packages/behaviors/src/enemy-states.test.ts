// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, GltfModelBackend, installArchetype, Model, RigidBody, StateMachine, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { RIG_URL, serveRig } from '../../engine/src/test-rig.js'
import { defined } from '../../engine/src/test-support.js'
import { Chaser } from './chaser.js'
import { ENEMY_ROLE, ENEMY_STATE_GRAPH } from './enemy-states.js'
import { Health } from './health.js'
import * as behaviors from './index.js'
import { MeleeAttack } from './melee-attack.js'
import { Patrol } from './patrol.js'

// Issue #181 CA-20: the enemy role.

use3dTestEnvironment()
beforeEach(() => installArchetype({ roles: { enemy: ENEMY_ROLE, player: { description: 'The prey.', states: {} } } }))
afterEach(() => {
  vi.unstubAllGlobals()
})

const { initial, states } = ENEMY_STATE_GRAPH
/** The rig has idle, walk and jump: walking states play walk, the one-shots play jump once. */
const RIG_STATES = {
  ...states,
  patrol: { ...states.patrol, clip: 'walk' },
  chase: { ...states.chase, clip: 'walk' },
  windup: { ...states.windup, clip: 'idle' },
  attack: { ...states.attack, clip: 'jump' },
  hurt: { ...states.hurt, clip: 'jump' },
  die: { ...states.die, clip: 'idle' },
}

const capsule = { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } }

/** The Skeleton, with its Animator's clip overrides (the rig's jump plays once by default). */
const skeletonWith = (clips: Record<string, { loop?: boolean }>): SceneEntityJson => ({
  name: 'Skeleton',
  position: [0, 0.9, 0],
  components: [
    { type: 'Model', props: { src: RIG_URL } },
    { type: 'Animator', props: { fade: 0, clips } },
    capsule,
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'Patrol', props: { axis: 'horizontal', distance: 1, speed: 1 } },
    { type: 'Chaser', props: { range: 5, speed: 2 } },
    { type: 'MeleeAttack', props: { range: 1.2 } },
    { type: 'Health', props: { max: 3 } },
    { type: 'StateMachine', props: { role: 'enemy', initial, states: RIG_STATES } },
  ],
})
const SKELETON = skeletonWith({ jump: { loop: false } })

/** A player that stays in the scene when it dies, in a die state, as the character role's does. */
const MORTAL_PLAYER = { idle: {}, die: {}, '*': { transitions: [{ on: 'signal:death', to: 'die' }] } }

const playerAt = (x: number, z: number): SceneEntityJson => ({
  name: 'Player',
  position: [x, 0.9, z],
  components: [capsule, { type: 'RigidBody', props: { type: 'kinematic' } }, { type: 'Health', props: { max: 6 } }, { type: 'StateMachine', props: { role: 'player', initial: 'idle', states: MORTAL_PLAYER } }],
})

async function arena(playerX: number, skeletonEntity: SceneEntityJson = SKELETON): Promise<PhysicsFixture> {
  serveRig()
  const fixture = await physicsFixture([FLOOR, skeletonEntity, playerAt(playerX, 0)], {
    components: { Model, Animator, StateMachine, Patrol, Chaser, MeleeAttack, Health },
    game: { models: new GltfModelBackend() },
  })
  fixture.step(5)
  return fixture
}

const skeleton = (fixture: PhysicsFixture) => defined(fixture.game.find('Skeleton'))
const stateOf = (fixture: PhysicsFixture): string => defined(skeleton(fixture).get(StateMachine)).current
const movePlayer = (fixture: PhysicsFixture, x: number): void => {
  defined(fixture.game.find('Player')).position.set(x, 0.9, 0)
}

it('is exported from behaviors with its six states (CA-20)', () => {
  expect(behaviors.ENEMY_ROLE).toBe(ENEMY_ROLE)
  expect(Object.keys(states).filter((name) => name !== '*').sort()).toEqual(['attack', 'chase', 'die', 'hurt', 'patrol', 'windup'])
  expect(initial).toBe('patrol')
  expect(ENEMY_ROLE.driver).toBe('Chaser')
  expect(states['*']?.transitions).toEqual([
    { on: 'signal:death', to: 'die' },
    { on: 'signal:hurt', to: 'hurt' },
  ])
})

it('patrols, chases a player inside Chaser.range and patrols again once it leaves (CA-20)', async () => {
  const fixture = await arena(12)
  expect(stateOf(fixture)).toBe('patrol')

  movePlayer(fixture, 4)
  fixture.step(2)
  expect(stateOf(fixture)).toBe('chase')

  movePlayer(fixture, 14)
  fixture.step(2)
  expect(stateOf(fixture)).toBe('patrol')
})

it('winds up still within MeleeAttack.range for 0.6 s, then strikes once and chases on (CA-20)', async () => {
  const fixture = await arena(3)
  const strike = vi.spyOn(defined(skeleton(fixture).get(MeleeAttack)), 'strike')
  const seen: string[] = []
  const xInWindup: number[] = []
  for (let frame = 0; frame < 150; frame += 1) {
    fixture.step(1)
    if (seen.at(-1) !== stateOf(fixture)) seen.push(stateOf(fixture))
    // The first windup only: once it has struck it chases and winds up again.
    if (stateOf(fixture) === 'windup' && seen.length === 2) xInWindup.push(skeleton(fixture).position.x)
  }

  expect(seen.slice(0, 4)).toEqual(['chase', 'windup', 'attack', 'chase'])
  expect(xInWindup.length).toBeGreaterThanOrEqual(35)
  expect(xInWindup.length).toBeLessThanOrEqual(37)
  expect(new Set(xInWindup).size).toBe(1)
  expect(strike).toHaveBeenCalled()
  expect(defined(defined(fixture.game.find('Player')).get(Health)).current).toBeLessThan(6)
})

it('plays hurt on a hit for its clip, then decides again (CA-20)', async () => {
  const fixture = await arena(4)
  fixture.step(2)
  expect(stateOf(fixture)).toBe('chase')

  defined(skeleton(fixture).get(Health)).damage(1)
  fixture.step(1)
  expect(stateOf(fixture)).toBe('hurt')
  fixture.step(40)

  expect(['chase', 'windup', 'attack']).toContain(stateOf(fixture))
})

it('enters die on a Health death and stops the body (CA-20)', async () => {
  const fixture = await arena(4)
  fixture.step(2)

  defined(skeleton(fixture).get(Health)).damage(Number.POSITIVE_INFINITY)
  fixture.step(60)

  expect(stateOf(fixture)).toBe('die')
  expect(skeleton(fixture).alive).toBe(true)
  expect(defined(skeleton(fixture).get(RigidBody)).desiredVelocity).toEqual({ x: 0, z: 0 })
})

it('leaves hurt and attack on time when its Animator plays no one-shot of its own (CA-20)', async () => {
  const looping = skeletonWith({})
  const hurtFixture = await arena(4, looping)
  hurtFixture.step(2)
  defined(skeleton(hurtFixture).get(Health)).damage(1)
  hurtFixture.step(1)
  expect(stateOf(hurtFixture)).toBe('hurt')
  hurtFixture.step(40)
  expect(stateOf(hurtFixture)).not.toBe('hurt')

  const attackFixture = await arena(3, looping)
  const seen: string[] = []
  for (let frame = 0; frame < 150; frame += 1) {
    attackFixture.step(1)
    if (seen.at(-1) !== stateOf(attackFixture)) seen.push(stateOf(attackFixture))
  }
  expect(seen.slice(0, 4)).toEqual(['chase', 'windup', 'attack', 'chase'])
})

it('stops chasing a player whose Health is down, while it lies in its die state (CA-20)', async () => {
  const fixture = await arena(4)
  fixture.step(2)
  expect(stateOf(fixture)).toBe('chase')

  defined(defined(fixture.game.find('Player')).get(Health)).damage(Number.POSITIVE_INFINITY)
  fixture.step(3)

  expect(defined(fixture.game.find('Player')).alive).toBe(true)
  expect(stateOf(fixture)).toBe('patrol')
})

/** The enemy's states over `frames` steps, each with the planar speed of its body as the step began and its Animator's speed parameter after it. */
function speedReadings(fixture: PhysicsFixture, frames: number): { state: string; planar: number; param: number | undefined }[] {
  const readings: { state: string; planar: number; param: number | undefined }[] = []
  for (let frame = 0; frame < frames; frame += 1) {
    const { x, z } = defined(skeleton(fixture).get(RigidBody)).linearVelocity
    fixture.step(1)
    readings.push({ state: stateOf(fixture), planar: Math.hypot(x, z), param: defined(skeleton(fixture).get(Animator)).inspectState().params.speed })
  }
  return readings
}

it('writes its planar speed to the Animator after the step of every state: patrol, chase, windup and attack (issue #205 CA-14)', async () => {
  const readings = [...speedReadings(await arena(12), 30), ...speedReadings(await arena(4), 180)]

  for (const { state, planar, param } of readings) expect(param, state).toBeCloseTo(planar, 9)
  expect(new Set(readings.map(({ state }) => state))).toEqual(new Set(['patrol', 'chase', 'windup', 'attack']))
  expect(Math.max(...readings.filter(({ state }) => state === 'chase').map(({ planar }) => planar))).toBeGreaterThan(1)
})

it('writes its planar speed to the Animator after the step of hurt and die too (issue #205 CA-14)', async () => {
  const fixture = await arena(4)
  const health = defined(skeleton(fixture).get(Health))
  const before = speedReadings(fixture, 20)
  health.damage(1)
  const hurt = speedReadings(fixture, 10)
  health.damage(Number.POSITIVE_INFINITY)
  const dead = speedReadings(fixture, 20)
  const readings = [...before, ...hurt, ...dead]

  for (const { state, planar, param } of readings) expect(param, state).toBeCloseTo(planar, 9)
  expect(hurt.map(({ state }) => state)).toContain('hurt')
  expect(new Set(dead.map(({ state }) => state))).toEqual(new Set(['die']))
  expect(Math.max(...before.map(({ planar }) => planar))).toBeGreaterThan(1)
  expect(defined(dead.at(-1)).param).toBeLessThan(0.1)
})

