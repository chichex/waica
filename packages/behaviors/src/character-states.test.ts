// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, GltfModelBackend, installArchetype, Model, nextTransition, RigidBody, roleDefinition, StateMachine, type SceneComponentJson, type SceneEntityJson, type TriggerEnv } from '@waica/engine'
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
function player(extra: SceneComponentJson[] = [], machineStates: Record<string, unknown> = states): SceneEntityJson {
  return {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      ...extra,
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
    // Issue #181 CA-15 adds run, roll and attack after the original five.
    expect(Object.keys(roleDefinition('character')?.signals ?? {})).toEqual(['move', 'stop', 'rise', 'fall', 'land', 'run', 'roll', 'attack'])
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

  it('never passes through fall or jump while Rapier loads, on its first physics step, or after a teleport: air with no vertical speed is not a fall (review of PR #169)', async () => {
    // Spawned at rest, 5 cm above the floor, as the engine's character-controller tests spawn: a capsule authored exactly on the floor (y 0.9) is sunk and pushed out by the controller first, a real fall and rise.
    const atRest: SceneEntityJson = { ...player(), position: [0, 0.95, 0] }
    const fixture = await physicsFixture([FLOOR, atRest], { components: { CharacterMotor, StateMachine, Model, Animator }, game: { bindings: BINDINGS }, settle: false })
    const seen: string[] = []
    const run = (frames: number): void => {
      for (let frame = 0; frame < frames; frame += 1) {
        fixture.step(1)
        seen.push(stateOf(fixture))
      }
    }

    run(10)
    await fixture.game.assets.ready()
    run(20)
    defined(fixture.game.find('Player')).position.set(3, 0.95, 0)
    run(5)

    expect(seen).toHaveLength(35)
    expect(new Set(seen)).toEqual(new Set(['idle']))
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
    // state:clip pairs, so the sequence proves the state and not only the clip (fall plays walk here).
    const note = (): void => {
      const current = `${stateOf(fixture)}:${animator.current ?? 'none'}`
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

    expect(seen).toEqual(['idle:idle', 'walk:walk', 'idle:idle', 'jump:jump', 'fall:walk', 'idle:idle'])
    expect(stateOf(fixture)).toBe('idle')
  })
})

/** One step, with the planar speed of the body as it began (what the role reads) and the Animator's speed parameter after it. */
function stepReading(fixture: PhysicsFixture): { planar: number; param: number | undefined } {
  const entity = defined(fixture.game.find('Player'))
  const { x, z } = defined(entity.get(RigidBody)).linearVelocity
  fixture.step(1)
  return { planar: Math.hypot(x, z), param: defined(entity.get(Animator)).inspectState().params.speed }
}

describe('the character role writes its planar speed to the Animator (issue #205 CA-14)', () => {
  it('sets speed every step from the body: walking, in the air and rolling', async () => {
    serveRig()
    const entity = player([{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: { fade: 0 } }])
    const fixture = await physicsFixture([FLOOR, entity], {
      components: { CharacterMotor, StateMachine, Model, Animator },
      game: { bindings: { ...BINDINGS, dodge: ['KeyC'] }, models: new GltfModelBackend() },
    })
    fixture.step(20)
    const readings: { planar: number; param: number | undefined; phase: string }[] = []
    const run = (frames: number, phase: string): void => {
      for (let frame = 0; frame < frames; frame += 1) readings.push({ ...stepReading(fixture), phase })
    }
    control(fixture, 'hold', 'right')
    run(15, 'walk')
    control(fixture, 'press', 'dodge')
    run(10, 'roll')
    run(30, 'after the roll')
    control(fixture, 'press', 'jump')
    run(10, 'air')

    for (const { planar, param, phase } of readings) expect(param, phase).toBeCloseTo(planar, 9)
    const fastest = (phase: string): number => Math.max(...readings.filter((reading) => reading.phase === phase).map(({ planar }) => planar))
    expect(fastest('walk')).toBeGreaterThan(3)
    expect(fastest('air')).toBeGreaterThan(3)
    expect(fastest('roll')).toBeGreaterThan(fastest('walk'))
  })
})
