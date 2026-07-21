import { describe, expect, it } from 'vitest'
import { nextTransition, type TriggerEnv } from '@waica/engine'
import { PLATFORMER_STATE_GRAPH } from './platformer-states'

const { initial, states } = PLATFORMER_STATE_GRAPH

function withSignals(...signals: string[]): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(signals) }
}

describe('PLATFORMER_STATE_GRAPH', () => {
  it('is internally consistent: initial and every edge target exist', () => {
    expect(states[initial]).toBeDefined()
    for (const [name, state] of Object.entries(states)) {
      for (const edge of state.transitions ?? []) {
        expect(states[edge.to], `${name} --${edge.on}--> ${edge.to}`).toBeDefined()
      }
    }
  })

  it('still on the ground → idle', () => {
    expect(nextTransition(states, 'run', withSignals('land', 'stop'))).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('land', 'stop'))).toBeUndefined()
  })

  it('moving on the ground → run', () => {
    expect(nextTransition(states, 'idle', withSignals('land', 'move'))).toBe('run')
    expect(nextTransition(states, 'run', withSignals('land', 'move'))).toBeUndefined()
  })

  it('airborne going up → jump, going down → fall', () => {
    expect(nextTransition(states, 'idle', withSignals('rise'))).toBe('jump')
    expect(nextTransition(states, 'run', withSignals('fall'))).toBe('fall')
    expect(nextTransition(states, 'jump', withSignals('fall'))).toBe('fall')
  })

  it('landing chains back to idle, then to run while moving', () => {
    expect(nextTransition(states, 'fall', withSignals('land', 'move'))).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('land', 'move'))).toBe('run')
  })

  it('supports the coyote jump: rising from the fall state', () => {
    expect(nextTransition(states, 'fall', withSignals('rise'))).toBe('jump')
  })
})
