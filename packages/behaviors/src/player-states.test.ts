import { describe, expect, it } from 'vitest'
import { logicSet, nextTransition, roleDefinition, type TriggerEnv } from '@waica/engine'
import { PLAYER_STATE_GRAPH, playerUpdate } from './player-states'

const { initial, states } = PLAYER_STATE_GRAPH

function withSignals(...signals: string[]): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(signals) }
}

describe('PLAYER_STATE_GRAPH', () => {
  it('is internally consistent: initial and every edge target exist', () => {
    expect(states[initial]).toBeDefined()
    for (const [name, state] of Object.entries(states)) {
      for (const edge of state.transitions ?? []) {
        expect(states[edge.to], `${name} --${edge.on}--> ${edge.to}`).toBeDefined()
      }
    }
  })

  it('still on the ground → idle', () => {
    expect(nextTransition(states, 'run', withSignals('land', 'stop'))?.to).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('land', 'stop'))?.to).toBeUndefined()
  })

  it('moving on the ground → run', () => {
    expect(nextTransition(states, 'idle', withSignals('land', 'move'))?.to).toBe('run')
    expect(nextTransition(states, 'run', withSignals('land', 'move'))?.to).toBeUndefined()
  })

  it('airborne going up → jump, going down → fall', () => {
    expect(nextTransition(states, 'idle', withSignals('rise'))?.to).toBe('jump')
    expect(nextTransition(states, 'run', withSignals('fall'))?.to).toBe('fall')
    expect(nextTransition(states, 'jump', withSignals('fall'))?.to).toBe('fall')
  })

  it('landing chains back to idle, then to run while moving', () => {
    expect(nextTransition(states, 'fall', withSignals('land', 'move'))?.to).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('land', 'move'))?.to).toBe('run')
  })

  it('supports the coyote jump: rising from the fall state', () => {
    expect(nextTransition(states, 'fall', withSignals('rise'))?.to).toBe('jump')
  })
})

describe("the player role's extension surface", () => {
  it('gives custom states the stock body update by default', () => {
    expect(logicSet('player')?.['default']?.onUpdate).toBe(playerUpdate)
  })

  it('declares the signals its update emits, for the editor pickers', () => {
    expect(Object.keys(roleDefinition('player')?.signals ?? {})).toEqual([
      'move',
      'stop',
      'rise',
      'fall',
      'land',
    ])
  })
})
