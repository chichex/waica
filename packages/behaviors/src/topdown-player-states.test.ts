import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installArchetype,
  logicSet,
  nextTransition,
  roleDefinition,
  THREE,
  type Entity,
  type Game,
  type StateMachine,
  type TriggerEnv,
} from '@waica/engine'
import { TOPDOWN_PLAYER_ROLE, TOPDOWN_PLAYER_STATE_GRAPH, topdownPlayerUpdate } from './topdown-player-states'
import { TopDownMotor } from './topdown-motor'

beforeEach(() => installArchetype({ roles: { player: TOPDOWN_PLAYER_ROLE } }))

const { initial, states } = TOPDOWN_PLAYER_STATE_GRAPH

function withSignals(...signals: string[]): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(signals) }
}

describe('TOPDOWN_PLAYER_STATE_GRAPH', () => {
  it('is internally consistent: initial and every edge target exist', () => {
    expect(states[initial]).toBeDefined()
    for (const [name, state] of Object.entries(states)) {
      for (const edge of state.transitions ?? []) {
        expect(states[edge.to], `${name} --${edge.on}--> ${edge.to}`).toBeDefined()
      }
    }
  })

  it('moving → walk, stopping → idle', () => {
    expect(nextTransition(states, 'idle', withSignals('move'))?.to).toBe('walk')
    expect(nextTransition(states, 'walk', withSignals('stop'))?.to).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('stop'))?.to).toBeUndefined()
    expect(nextTransition(states, 'walk', withSignals('move'))?.to).toBeUndefined()
  })

  it('dies from any state and comes back after the death beat', () => {
    expect(nextTransition(states, 'idle', withSignals('death'))?.to).toBe('dead')
    expect(nextTransition(states, 'walk', withSignals('death'))?.to).toBe('dead')
    expect(
      nextTransition(states, 'dead', { justPressed: () => false, elapsed: 0.9, signals: new Set() })
        ?.to,
    ).toBe('idle')
  })
})

describe("the topdown player role's extension surface", () => {
  it('gives custom states the stock body update by default', () => {
    expect(logicSet('player')?.['default']?.onUpdate).toBe(topdownPlayerUpdate)
  })

  it('runs the always-hook in every state, so interact survives custom states', () => {
    expect(logicSet('player')?.['*']?.onUpdate).toBeTypeOf('function')
  })

  it('declares the signals its update emits, for the editor pickers', () => {
    expect(Object.keys(roleDefinition('player')?.signals ?? {})).toEqual(['move', 'stop'])
  })
})

describe('topdownPlayerUpdate', () => {
  function makePlayer() {
    const entities: Entity[] = []
    let axes: Record<string, number> = {}
    const game = {
      entities,
      input: {
        axis: (negative = 'left', positive = 'right') =>
          (axes[positive] ?? 0) - (axes[negative] ?? 0),
      },
    } as unknown as Game
    const motor = new TopDownMotor()
    const entity = {
      game,
      position: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      get(Class: unknown) {
        return Class === TopDownMotor ? motor : undefined
      },
    } as unknown as Entity
    motor.entity = entity
    motor.game = game
    const fsm = { signal: vi.fn() } as unknown as StateMachine
    return {
      motor,
      entity,
      fsm,
      hold(held: Record<string, number>) {
        axes = held
      },
      frame() {
        topdownPlayerUpdate({ entity, game, fsm }, 1 / 60)
      },
    }
  }

  it('drives the motor from the four-direction actions and signals move', () => {
    const player = makePlayer()
    player.hold({ right: 1, up: 1 })

    for (let i = 0; i < 30; i += 1) player.frame()

    expect(player.motor.vx).toBeGreaterThan(0)
    expect(player.motor.vy).toBeGreaterThan(0)
    expect(player.entity.position.x).toBeGreaterThan(0)
    expect(player.fsm.signal).toHaveBeenLastCalledWith('move')
  })

  it('signals stop once the body settles', () => {
    const player = makePlayer()
    player.hold({ right: 1 })
    for (let i = 0; i < 30; i += 1) player.frame()

    player.hold({})
    for (let i = 0; i < 120; i += 1) player.frame()

    expect(player.fsm.signal).toHaveBeenLastCalledWith('stop')
  })
})
