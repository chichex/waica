// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, GltfModelBackend, installArchetype, Model, nextTransition, roleDefinition, StateMachine, type SceneEntityJson, type TriggerEnv } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { RIG_URL, serveRig } from '../../engine/src/test-rig.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'
import { CHARACTER_ROLE, CHARACTER_STATE_GRAPH, characterUpdate } from './character-states.js'

use3dTestEnvironment()

beforeEach(() => installArchetype({ roles: { character: CHARACTER_ROLE } }))
afterEach(() => {
  vi.unstubAllGlobals()
})

const { initial, states } = CHARACTER_STATE_GRAPH

function withSignals(...signals: string[]): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(signals), clipFinished: false }
}

const BINDINGS = { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['Space'] }

/** The Player: a capsule, a kinematic body, the motor and a machine in the character role; `extra` adds a Model and an Animator. */
function player(extra: unknown[] = [], machineStates: Record<string, unknown> = states): SceneEntityJson {
  return {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      ...(extra as SceneEntityJson['components'] & unknown[]),
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic' } },
      { type: 'CharacterMotor' },
      { type: 'StateMachine', props: { role: 'character', initial, states: machineStates } },
    ],
  }
}

async function playground(entity = player()): Promise<PhysicsFixture> {
  const fixture = await physicsFixture([FLOOR, entity], { components: { CharacterMotor, StateMachine, Model, Animator }, game: { bindings: BINDINGS } })
  fixture.step(20)
  return fixture
}

const stateOf = (fixture: PhysicsFixture): string => defined(defined(fixture.game.find('Player')).get(StateMachine)).current
const control = (fixture: PhysicsFixture, operation: 'hold' | 'release' | 'press', action: string): void => {
  fixture.bridge.control({ operation, action })
}

describe('CHARACTER_STATE_GRAPH (issue #166 CA-15)', () => {
  it('is internally consistent and starts idle', () => {
    expect(initial).toBe('idle')
    for (const [name, state] of Object.entries(states)) {
      for (const edge of state.transitions ?? []) expect(states[edge.to], `${name} --${edge.on}--> ${edge.to}`).toBeDefined()
    }
  })

  it('walks, stops, rises, falls and lands on the signals the role emits', () => {
    expect(nextTransition(states, 'idle', withSignals('land', 'move'))?.to).toBe('walk')
    expect(nextTransition(states, 'walk', withSignals('land', 'stop'))?.to).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('rise'))?.to).toBe('jump')
    expect(nextTransition(states, 'walk', withSignals('fall'))?.to).toBe('fall')
    expect(nextTransition(states, 'jump', withSignals('fall'))?.to).toBe('fall')
    expect(nextTransition(states, 'jump', withSignals('land', 'stop'))?.to).toBe('idle')
    expect(nextTransition(states, 'fall', withSignals('rise'))?.to).toBe('jump')
    expect(nextTransition(states, 'fall', withSignals('land', 'move'))?.to).toBe('idle')
  })

  it('names its driver, its signals and runs characterUpdate in every default state', () => {
    expect(CHARACTER_ROLE.driver).toBe('CharacterMotor')
    expect(Object.keys(roleDefinition('character')?.signals ?? {})).toEqual(['move', 'stop', 'rise', 'fall', 'land'])
    for (const state of ['default', 'idle', 'walk', 'jump', 'fall']) expect(Reflect.get(defined(CHARACTER_ROLE.states?.[state]), 'onUpdate'), state).toBe(characterUpdate)
  })
})

describe('the character role on a live body (issue #166 CA-15)', () => {
  it('starts idle, walks within 3 steps of holding right, and is idle again once stopped', async () => {
    const fixture = await playground()
    expect(stateOf(fixture)).toBe('idle')

    control(fixture, 'hold', 'right')
    fixture.step(3)
    expect(stateOf(fixture)).toBe('walk')

    control(fixture, 'release', 'right')
    fixture.step(3)
    expect(stateOf(fixture)).toBe('idle')
  })

  it('jumps while rising, falls while descending and is idle after landing', async () => {
    const fixture = await playground()
    control(fixture, 'press', 'jump')
    fixture.step(3)
    expect(stateOf(fixture)).toBe('jump')

    fixture.step(45)
    expect(stateOf(fixture)).toBe('fall')

    fixture.step(60)
    expect(stateOf(fixture)).toBe('idle')
  })
})

describe('the character role beside an Animator on the rig (issue #166 CA-15)', () => {
  it('has Animator.current follow idle → walk → jump → fall → idle', async () => {
    serveRig()
    // The rig fixture has idle, walk and jump: the fall state plays walk here, so the sequence stays observable.
    const machineStates = { ...states, fall: { ...states.fall, clip: 'walk' } }
    const entity = player([{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: { fade: 0 } }], machineStates)
    const fixture = await physicsFixture([FLOOR, entity], {
      components: { CharacterMotor, StateMachine, Model, Animator },
      game: { bindings: BINDINGS, models: new GltfModelBackend() },
    })
    const animator = defined(defined(fixture.game.find('Player')).get(Animator))
    const seen: string[] = []
    const note = (): void => {
      const current = animator.current ?? 'none'
      if (seen.at(-1) !== current) seen.push(current)
    }
    const run = (frames: number): void => {
      for (let frame = 0; frame < frames; frame += 1) {
        fixture.step(1)
        note()
      }
    }

    // The spawn settles first (the capsule snaps onto the floor, as in playground()); recording starts once it stands.
    fixture.step(20)
    note()
    control(fixture, 'hold', 'right')
    run(20)
    control(fixture, 'release', 'right')
    run(10)
    control(fixture, 'press', 'jump')
    run(110)

    expect(seen).toEqual(['idle', 'walk', 'idle', 'jump', 'walk', 'idle'])
    expect(stateOf(fixture)).toBe('idle')
  })
})
