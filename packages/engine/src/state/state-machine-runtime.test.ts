import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedSprite } from '../components/animated-sprite'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { defineStates, resetRegistries } from './hooks'
import { StateMachine } from './state-machine'

interface MachineHarness {
  machine: StateMachine
  consumed: string[]
  setPressed(action: string | null): void
}

function makeMachine(states: StateMachine['states'], sprite?: AnimatedSprite): MachineHarness {
  let pressed: string | null = null
  const used = new Set<string>()
  const consumed: string[] = []
  const input = {
    justPressed: (action: string) => action === pressed,
    consumed: (action: string) => used.has(action),
    consume: (action: string) => {
      used.add(action)
      consumed.push(action)
    },
  }
  const game = { input } as unknown as Game
  const entity = {
    name: 'Test character',
    game,
    get(Class: unknown) {
      return Class === AnimatedSprite ? sprite : undefined
    },
  } as unknown as Entity
  const machine = new StateMachine()
  machine.entity = entity
  machine.game = game
  machine.states = states
  machine.initial = Object.keys(states)[0] ?? ''
  return { machine, consumed, setPressed: (action) => (pressed = action) }
}

beforeEach(() => resetRegistries())

describe('StateMachine runtime characterization', () => {
  it('resolves a state clip override and asks the sibling sprite to play it', () => {
    const sprite = new AnimatedSprite()
    sprite.clips = { stand: { frames: [0], fps: 1 } }
    const play = vi.spyOn(sprite, 'play').mockImplementation(() => {})
    const { machine } = makeMachine({ idle: { clip: 'stand' } }, sprite)

    machine.onReady()

    expect(play).toHaveBeenCalledWith('stand')
  })

  it('consumes one key press so it cannot transition twice in the same frame', () => {
    const { machine, consumed, setPressed } = makeMachine({
      idle: { transitions: [{ on: 'input:dash', to: 'dashing' }] },
      dashing: { transitions: [{ on: 'input:dash', to: 'spent-twice' }] },
      'spent-twice': {},
    })
    machine.onReady()
    setPressed('dash')

    machine.onUpdate(0.016)

    expect(machine.current).toBe('dashing')
    expect(consumed).toEqual(['dash'])
  })

  it('consumes signals after settling chained transitions in the same frame', () => {
    const { machine } = makeMachine({
      idle: { transitions: [{ on: 'signal:advance', to: 'middle' }] },
      middle: { transitions: [{ on: 'signal:advance', to: 'done' }] },
      done: {},
    })
    machine.onReady()
    machine.signal('advance')

    machine.onUpdate(0.016)

    expect(machine.current).toBe('done')
    machine.goto('idle')
    machine.onUpdate(0.016)
    expect(machine.current).toBe('idle')
  })

  it('dispatches collision hooks for wildcard and current state with context and other', () => {
    const calls: Array<{ phase: string; ctxEntity: Entity; other: Entity }> = []
    const other = { name: 'Other' } as Entity
    defineStates('collision-runtime', {
      '*': {
        onCollide(ctx, hit) {
          calls.push({ phase: 'wildcard', ctxEntity: ctx.entity, other: hit })
        },
      },
      idle: {
        onCollide(ctx, hit) {
          calls.push({ phase: 'current', ctxEntity: ctx.entity, other: hit })
        },
      },
    })
    const { machine } = makeMachine({ idle: {} })
    machine.role = 'collision-runtime'
    machine.onReady()

    machine.onCollide(other)

    expect(calls).toEqual([
      { phase: 'wildcard', ctxEntity: machine.entity, other },
      { phase: 'current', ctxEntity: machine.entity, other },
    ])
  })

  it("uses the logic set's default collision hook only when the current state has none", () => {
    const calls: string[] = []
    defineStates('collision-default', {
      default: { onCollide: () => calls.push('default') },
      own: { onCollide: () => calls.push('own') },
      inherited: {},
    })
    const { machine } = makeMachine({ inherited: {}, own: {} })
    machine.role = 'collision-default'
    machine.onReady()

    machine.onCollide({ name: 'First' } as Entity)
    machine.goto('own')
    machine.onCollide({ name: 'Second' } as Entity)

    expect(calls).toEqual(['default', 'own'])
  })

  it('stays quiet when neither the state nor its set defines a collision hook', () => {
    const { machine } = makeMachine({ idle: {} })
    machine.onReady()

    expect(() => machine.onCollide({ name: 'Other' } as Entity)).not.toThrow()
  })

  it('documents initial onEnter running before later siblings are spawned', () => {
    // Documented current behavior, not approved behavior: Entity.add calls
    // onReady immediately, so an initial hook cannot see components added later.
    let siblingReady = false
    let sawSibling: boolean | undefined
    const { machine } = makeMachine({ idle: {} })
    machine.on('idle', { onEnter: () => (sawSibling = siblingReady) })

    machine.onReady()
    siblingReady = true

    expect(sawSibling).toBe(false)
  })
})
