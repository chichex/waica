import { describe, expect, it, vi } from 'vitest'
import { AnimatedSprite } from '../components/animated-sprite'
import type { Entity } from '../entity'
import type { Game } from '../game'
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
