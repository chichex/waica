// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, GltfModelBackend, installArchetype, Model, StateMachine, type SceneComponentJson, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { RIG_URL, serveRig } from '../../engine/src/test-rig.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'
import { CHARACTER_ROLE, CHARACTER_STATE_GRAPH } from './character-states.js'
import { MeleeAttack } from './melee-attack.js'

// Issue #181 CA-15: the character role's run, attack and roll states.

use3dTestEnvironment()
beforeEach(() => installArchetype({ roles: { character: CHARACTER_ROLE } }))
afterEach(() => {
  vi.unstubAllGlobals()
})

const BINDINGS = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space'], run: ['ShiftLeft'], attack: ['KeyJ'], dodge: ['KeyC'] }
const { initial, states } = CHARACTER_STATE_GRAPH
/** The rig fixture has idle, walk and jump: run and roll play walk, and attack plays jump once. */
const RIG_STATES = { ...states, run: { ...states.run, clip: 'walk' }, roll: { ...states.roll, clip: 'walk' }, attack: { ...states.attack, clip: 'jump' } }

function player(extra: SceneComponentJson[]): SceneEntityJson {
  return {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      { type: 'Model', props: { src: RIG_URL } },
      { type: 'Animator', props: { fade: 0, clips: { jump: { loop: false } } } },
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'CharacterMotor' },
      { type: 'StateMachine', props: { role: 'character', initial, states: RIG_STATES } },
      ...extra,
    ],
  }
}

async function playground(extra: SceneComponentJson[] = [{ type: 'MeleeAttack' }], bindings: Record<string, string[]> = BINDINGS): Promise<PhysicsFixture> {
  serveRig()
  const fixture = await physicsFixture([FLOOR, player(extra)], {
    components: { CharacterMotor, StateMachine, Model, Animator, MeleeAttack },
    game: { bindings, models: new GltfModelBackend() },
  })
  fixture.step(20)
  return fixture
}

const stateOf = (fixture: PhysicsFixture): string => defined(defined(fixture.game.find('Player')).get(StateMachine)).current
const act = (fixture: PhysicsFixture, operation: 'press' | 'hold' | 'release', action: string): void => {
  fixture.bridge.control({ operation, action })
}

/** The states the Player passes through over `frames` steps, without repeats. */
function statesOver(fixture: PhysicsFixture, frames: number): string[] {
  const seen: string[] = []
  for (let frame = 0; frame < frames; frame += 1) {
    fixture.step(1)
    if (seen.at(-1) !== stateOf(fixture)) seen.push(stateOf(fixture))
  }
  return seen
}

it('has run, attack and roll states reachable from the ground states (CA-15)', () => {
  for (const name of ['run', 'attack', 'roll']) expect(states[name], name).toBeDefined()
  expect(states.attack?.transitions).toEqual([{ on: 'clip:end', to: 'idle' }])
  for (const ground of ['idle', 'walk', 'run']) {
    const targets = (states[ground]?.transitions ?? []).map((edge) => edge.to)
    expect(targets, ground).toEqual(expect.arrayContaining(['attack', 'roll', 'idle' === ground ? 'walk' : 'idle']))
  }
})

it('runs from walk while running, and walks again once run is released (CA-15)', async () => {
  const fixture = await playground()
  act(fixture, 'hold', 'right')
  fixture.step(3)
  expect(stateOf(fixture)).toBe('walk')
  act(fixture, 'hold', 'run')
  fixture.step(3)
  expect(stateOf(fixture)).toBe('run')
  act(fixture, 'release', 'run')
  fixture.step(3)
  expect(stateOf(fixture)).toBe('walk')
})

it('attacks on a press: strikes once at 40 % of its clip, stands still and is idle on clip:end (CA-15)', async () => {
  const fixture = await playground()
  const entity = defined(fixture.game.find('Player'))
  const animator = defined(entity.get(Animator))
  const struckAt: number[] = []
  vi.spyOn(defined(entity.get(MeleeAttack)), 'strike').mockImplementation(() => {
    struckAt.push(animator.clipProgress)
    return []
  })
  act(fixture, 'press', 'attack')
  fixture.step(2)
  expect(stateOf(fixture)).toBe('attack')
  expect(struckAt).toEqual([])
  act(fixture, 'hold', 'right')
  const x = entity.position.x
  const xWhileAttacking: number[] = []
  const seen: string[] = []
  for (let frame = 0; frame < 120; frame += 1) {
    fixture.step(1)
    if (stateOf(fixture) === 'attack') xWhileAttacking.push(entity.position.x)
    if (seen.at(-1) !== stateOf(fixture)) seen.push(stateOf(fixture))
  }

  expect(seen.slice(0, 2)).toEqual(['attack', 'idle'])
  expect(struckAt).toHaveLength(1)
  expect(struckAt[0]).toBeGreaterThanOrEqual(0.4)
  expect(struckAt[0]).toBeLessThan(0.5)
  expect(new Set(xWhileAttacking)).toEqual(new Set([x]))
})

it('rolls in the roll state while the motor rolls (CA-15)', async () => {
  const fixture = await playground()
  act(fixture, 'press', 'dodge')

  const seen = statesOver(fixture, 40)
  expect(seen[0]).toBe('roll')
  expect(seen.filter((state) => state === 'roll')).toHaveLength(1)
  expect(seen.at(-1)).toBe('idle')
})

it('never enters attack without a MeleeAttack, nor any new state with the new Actions unbound (CA-15)', async () => {
  const unarmed = await playground([])
  act(unarmed, 'press', 'attack')
  expect(statesOver(unarmed, 30)).toEqual(['idle'])

  const plain = Object.fromEntries(Object.entries(BINDINGS).filter(([action]) => !['run', 'attack', 'dodge'].includes(action)))
  const fixture = await playground(undefined, plain)
  act(fixture, 'hold', 'right')
  const walked = statesOver(fixture, 20)
  act(fixture, 'press', 'jump')
  const jumped = statesOver(fixture, 120)
  expect(new Set([...walked, ...jumped])).toEqual(new Set(['walk', 'jump', 'fall', 'idle']))
})
