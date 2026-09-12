import { beforeEach, describe, expect, it } from 'vitest'
import {
  closestLogicSet,
  defineRole,
  defineStates,
  installArchetype,
  logicSet,
  registeredLogicSets,
  registeredRoles,
  resetRegistries,
  roleDefinition,
} from './hooks'

beforeEach(() => resetRegistries())
import type { Entity } from '../entity'
import { SIMULATION_STEP } from '../fixed-step'
import type { Game } from '../game'
import {
  evaluateTrigger,
  nextTransition,
  phaseHooks,
  StateMachine,
  type StateJson,
  type TriggerEnv,
} from './state-machine'

function env(over: Partial<TriggerEnv> = {}): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(), ...over }
}

describe('evaluateTrigger', () => {
  it('input:<action> fires on justPressed', () => {
    const e = env({ justPressed: (a) => a === 'dash' })
    expect(evaluateTrigger('input:dash', e)).toBe(true)
    expect(evaluateTrigger('input:jump', e)).toBe(false)
  })

  it('timer:<seconds> fires once the state is old enough', () => {
    expect(evaluateTrigger('timer:0.25', env({ elapsed: 0.1 }))).toBe(false)
    expect(evaluateTrigger('timer:0.25', env({ elapsed: 0.25 }))).toBe(true)
  })

  it('signal:<name> fires while the signal is queued', () => {
    expect(evaluateTrigger('signal:hurt', env({ signals: new Set(['hurt']) }))).toBe(true)
    expect(evaluateTrigger('signal:hurt', env())).toBe(false)
  })

  it('malformed or unknown triggers never fire', () => {
    const e = env({ justPressed: () => true, elapsed: 99, signals: new Set(['x']) })
    expect(evaluateTrigger('dash', e)).toBe(false)
    expect(evaluateTrigger(':dash', e)).toBe(false)
    expect(evaluateTrigger('timer:soon', e)).toBe(false)
    expect(evaluateTrigger('weird:x', e)).toBe(false)
  })
})

describe('nextTransition', () => {
  const states: Record<string, StateJson> = {
    idle: {
      transitions: [
        { on: 'input:dash', to: 'dashing' },
        { on: 'signal:move', to: 'run' },
      ],
    },
    dashing: { transitions: [{ on: 'timer:0.25', to: 'idle' }] },
    '*': { transitions: [{ on: 'signal:hurt', to: 'hurt' }] },
  }

  it('picks the first edge that fires, in declared order', () => {
    const e = env({ justPressed: () => true, signals: new Set(['move']) })
    expect(nextTransition(states, 'idle', e)?.to).toBe('dashing')
  })

  it("falls back to '*' edges from any state", () => {
    const e = env({ signals: new Set(['hurt']) })
    expect(nextTransition(states, 'idle', e)?.to).toBe('hurt')
    expect(nextTransition(states, 'dashing', e)?.to).toBe('hurt')
  })

  it('returns undefined when nothing fires', () => {
    expect(nextTransition(states, 'dashing', env({ elapsed: 0.1 }))).toBeUndefined()
  })

  it('returns the edge itself, so the machine can spend its key press', () => {
    const e = env({ justPressed: () => true })
    expect(nextTransition(states, 'idle', e)?.on).toBe('input:dash')
  })
})

describe('phaseHooks', () => {
  const own = { onEnter: () => {} }
  const fallback = { onUpdate: () => {}, onEnter: () => {} }

  it("uses the set's 'default' when no hook defines the phase", () => {
    expect(phaseHooks([own], fallback, 'onUpdate')).toEqual([fallback])
  })

  it('prefers the state’s own hook for a phase it defines', () => {
    expect(phaseHooks([own], fallback, 'onEnter')).toEqual([own])
  })

  it('stays with the state’s hooks when there is no fallback for the phase', () => {
    expect(phaseHooks([own], undefined, 'onUpdate')).toEqual([own])
    expect(phaseHooks([own], { onExit: () => {} }, 'onUpdate')).toEqual([own])
  })
})

describe('defineStates', () => {
  it('merges repeated registrations per state — extending a set', () => {
    const enter = () => {}
    defineStates('test-merge', { idle: {} })
    defineStates('test-merge', { dashing: { onEnter: enter } })
    expect(Object.keys(logicSet('test-merge') ?? {})).toEqual(['idle', 'dashing'])
    expect(logicSet('test-merge')?.dashing?.onEnter).toBe(enter)
  })

  it('later registrations of the same state win', () => {
    const second = () => {}
    defineStates('test-override', { idle: { onEnter: () => {} } })
    defineStates('test-override', { idle: { onEnter: second } })
    expect(logicSet('test-override')?.idle?.onEnter).toBe(second)
  })
})

describe('defineRole', () => {
  it('registers the package: description, driver, graph and state code', () => {
    defineRole('test-role', {
      description: 'A test role.',
      driver: 'TestDriver',
      graph: { initial: 'idle', states: { idle: {} } },
      states: { idle: {} },
    })
    expect(registeredRoles()).toContain('test-role')
    expect(roleDefinition('test-role')?.driver).toBe('TestDriver')
    expect(roleDefinition('test-role')?.graph?.initial).toBe('idle')
    // The role's name doubles as its logic-set name.
    expect(logicSet('test-role')?.idle).toBeDefined()
  })

  it('merges repeated registrations, keeping earlier states', () => {
    defineRole('test-role-merge', {
      description: 'First.',
      states: { idle: {} },
    })
    defineRole('test-role-merge', { description: 'Second.', driver: 'X' })
    expect(roleDefinition('test-role-merge')?.description).toBe('Second.')
    expect(roleDefinition('test-role-merge')?.driver).toBe('X')
    expect(logicSet('test-role-merge')?.idle).toBeDefined()
  })

  it('is extendable with defineStates under the same name', () => {
    defineRole('test-role-extend', { description: 'Extendable.', states: { idle: {} } })
    defineStates('test-role-extend', { dashing: {} })
    expect(Object.keys(logicSet('test-role-extend') ?? {})).toEqual(['idle', 'dashing'])
  })

  it('stays quiet on unknown roles', () => {
    expect(roleDefinition('nope-nope')).toBeUndefined()
  })
})

describe('archetype registry installation', () => {
  it('replaces every role and logic set instead of retaining merge residue', () => {
    installArchetype({
      roles: {
        player: {
          description: 'Old player.',
          states: { run: {}, jump: {} },
        },
      },
      logicSets: { 'old-utility': { waiting: {} } },
    })

    installArchetype({
      roles: {
        player: {
          description: 'New player.',
          states: { walk: {} },
        },
      },
    })

    expect(registeredRoles()).toEqual(['player'])
    expect(registeredLogicSets()).toEqual(['player'])
    expect(Object.keys(logicSet('player') ?? {})).toEqual(['walk'])
    expect(logicSet('player')?.run).toBeUndefined()
    expect(logicSet('player')?.jump).toBeUndefined()
  })

  it('exposes an explicit reset for hosts that are leaving an archetype', () => {
    defineRole('temporary', { description: 'Temporary.', states: { idle: {} } })

    resetRegistries()

    expect(registeredRoles()).toEqual([])
    expect(registeredLogicSets()).toEqual([])
  })
})

describe('closestLogicSet', () => {
  it('suggests a near-miss set name', () => {
    defineStates('platformer-suggest', { idle: {} })
    expect(closestLogicSet('platfromer-suggest')).toBe('platformer-suggest')
  })

  it('stays quiet when nothing is close', () => {
    expect(closestLogicSet('zzzzzzzzzzzz')).toBeUndefined()
  })
})

describe('StateMachine timers at the Simulation Step (CA-9)', () => {
  it('fires a timer:0.3 transition on the 18th step and not on the 17th', () => {
    // ATTACK_SECONDS / HURT_SECONDS are 0.3 s: at the fixed step that is
    // exactly 18 whole steps, so the swing and the stun keep their length.
    const machine = new StateMachine()
    machine.entity = { name: 'Subject', components: [], get: () => undefined } as unknown as Entity
    machine.game = {
      input: { justPressed: () => false, consumed: () => false, consume: () => {} },
    } as unknown as Game
    machine.initial = 'swing'
    machine.states = {
      swing: { transitions: [{ on: 'timer:0.3', to: 'idle' }] },
      idle: {},
    }
    machine.onReady()

    for (let step = 1; step <= 17; step += 1) machine.onUpdate(SIMULATION_STEP)
    expect(machine.current).toBe('swing')

    machine.onUpdate(SIMULATION_STEP)
    expect(machine.current).toBe('idle')
  })

  it('fires a timer:0.25 transition on the 15th step and not on the 14th (regression: summed float error)', () => {
    // Summing 1/60 fifteen times gives 0.24999999999999997 < 0.25, so a bare
    // `>=` against the accumulated float fires one step late (the 16th);
    // 0.25 s is exactly 15 whole steps and must keep that length too.
    const machine = new StateMachine()
    machine.entity = { name: 'Subject', components: [], get: () => undefined } as unknown as Entity
    machine.game = {
      input: { justPressed: () => false, consumed: () => false, consume: () => {} },
    } as unknown as Game
    machine.initial = 'swing'
    machine.states = {
      swing: { transitions: [{ on: 'timer:0.25', to: 'idle' }] },
      idle: {},
    }
    machine.onReady()

    for (let step = 1; step <= 14; step += 1) machine.onUpdate(SIMULATION_STEP)
    expect(machine.current).toBe('swing')

    machine.onUpdate(SIMULATION_STEP)
    expect(machine.current).toBe('idle')
  })
})
