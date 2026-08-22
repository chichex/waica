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
import {
  ISO_PLAYER_ROLE,
  ISO_PLAYER_STATE_GRAPH,
  isoPlayerUpdate,
} from './iso-player-states'
import { IsoMotor } from './iso-motor'

beforeEach(() => installArchetype({ roles: { player: ISO_PLAYER_ROLE } }))

const { initial, states } = ISO_PLAYER_STATE_GRAPH

function withSignals(...signals: string[]): TriggerEnv {
  return { justPressed: () => false, elapsed: 0, signals: new Set(signals) }
}

describe('ISO_PLAYER_STATE_GRAPH', () => {
  it('is internally consistent: initial and every edge target exist', () => {
    expect(states[initial]).toBeDefined()
    for (const [name, state] of Object.entries(states)) {
      for (const edge of state.transitions ?? []) {
        expect(states[edge.to], `${name} --${edge.on}--> ${edge.to}`).toBeDefined()
      }
    }
  })

  it('moves from idle to walk and returns when stopped', () => {
    expect(nextTransition(states, 'idle', withSignals('move'))?.to).toBe('walk')
    expect(nextTransition(states, 'walk', withSignals('stop'))?.to).toBe('idle')
    expect(nextTransition(states, 'idle', withSignals('stop'))?.to).toBeUndefined()
    expect(nextTransition(states, 'walk', withSignals('move'))?.to).toBeUndefined()
  })

  it('dies from every state and returns after the death beat', () => {
    expect(nextTransition(states, 'idle', withSignals('death'))?.to).toBe('dead')
    expect(nextTransition(states, 'walk', withSignals('death'))?.to).toBe('dead')
    expect(
      nextTransition(states, 'dead', {
        justPressed: () => false,
        elapsed: 0.9,
        signals: new Set(),
      })?.to,
    ).toBe('idle')
  })
})

describe("the isometric player role's extension surface", () => {
  it('uses IsoMotor as its driver and body-update default', () => {
    expect(roleDefinition('player')?.driver).toBe('IsoMotor')
    expect(logicSet('player')?.['default']?.onUpdate).toBe(isoPlayerUpdate)
    expect(logicSet('player')?.['idle']?.onUpdate).toBe(isoPlayerUpdate)
    expect(logicSet('player')?.['walk']?.onUpdate).toBe(isoPlayerUpdate)
  })

  it('keeps interaction on the always-hook and declares move signals', () => {
    expect(logicSet('player')?.['*']?.onUpdate).toBeTypeOf('function')
    expect(Object.keys(roleDefinition('player')?.signals ?? {})).toEqual(['move', 'stop'])
  })
})

describe('isoPlayerUpdate', () => {
  function makePlayer() {
    let axes: Record<string, number> = {}
    const game = {
      entities: [],
      input: {
        axis: (negative = 'left', positive = 'right') =>
          (axes[positive] ?? 0) - (axes[negative] ?? 0),
      },
    } as unknown as Game
    const motor = new IsoMotor()
    const entity = {
      game,
      position: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      get(Class: unknown) {
        return Class === IsoMotor ? motor : undefined
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
        isoPlayerUpdate({ entity, game, fsm }, 1 / 60)
      },
    }
  }

  it('drives a real IsoMotor from screen-relative actions and signals move', () => {
    const player = makePlayer()
    player.hold({ right: 1 })

    for (let frame = 0; frame < 30; frame += 1) player.frame()

    expect(player.motor.facing).toBe('e')
    expect(player.entity.position.x).toBeGreaterThan(0)
    expect(player.entity.position.y).toBeLessThan(0)
    expect(player.fsm.signal).toHaveBeenLastCalledWith('move')
  })

  it('signals stop after the body settles', () => {
    const player = makePlayer()
    player.hold({ up: 1, right: 1 })
    for (let frame = 0; frame < 30; frame += 1) player.frame()

    player.hold({})
    for (let frame = 0; frame < 120; frame += 1) player.frame()

    expect(player.fsm.signal).toHaveBeenLastCalledWith('stop')
  })
})
