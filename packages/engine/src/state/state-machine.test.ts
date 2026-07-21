import { describe, expect, it } from 'vitest'
import { closestLogicSet, defineStates, logicSet } from './hooks'
import { evaluateTrigger, nextTransition, type StateJson, type TriggerEnv } from './state-machine'

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
    expect(nextTransition(states, 'idle', e)).toBe('dashing')
  })

  it("falls back to '*' edges from any state", () => {
    const e = env({ signals: new Set(['hurt']) })
    expect(nextTransition(states, 'idle', e)).toBe('hurt')
    expect(nextTransition(states, 'dashing', e)).toBe('hurt')
  })

  it('returns undefined when nothing fires', () => {
    expect(nextTransition(states, 'dashing', env({ elapsed: 0.1 }))).toBeUndefined()
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

describe('closestLogicSet', () => {
  it('suggests a near-miss set name', () => {
    defineStates('platformer-suggest', { idle: {} })
    expect(closestLogicSet('platfromer-suggest')).toBe('platformer-suggest')
  })

  it('stays quiet when nothing is close', () => {
    expect(closestLogicSet('zzzzzzzzzzzz')).toBeUndefined()
  })
})
