import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from '../component'
import { resolveComponentUpdateSchedule } from '../component-update-schedule'
import { AnimatedSprite } from '../components/animated-sprite'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { defineStates, resetRegistries } from './hooks'
import { StateMachine } from './state-machine'

interface MachineHarness {
  machine: StateMachine
  consumed: string[]
  setPressed(action: string | null): void
  /** Marks the machine's own entity destroyed, like Entity.destroy() does. */
  kill(): void
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
  let alive = true
  const entity = {
    name: 'Test character',
    game,
    get alive() {
      return alive
    },
    get(Class: unknown) {
      return Class === AnimatedSprite ? sprite : undefined
    },
  } as unknown as Entity
  const machine = new StateMachine()
  machine.entity = entity
  machine.game = game
  machine.states = states
  machine.initial = Object.keys(states)[0] ?? ''
  return {
    machine,
    consumed,
    setPressed: (action) => (pressed = action),
    kill: () => {
      alive = false
    },
  }
}

/** A live collision partner: the machine skips contacts whose sides are dead. */
function otherEntity(name: string): Entity {
  return { name, alive: true } as unknown as Entity
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

  it('lets AnimatedSprite observe a clip selected by StateMachine in the same frame under reversed source order', () => {
    const sprite = new AnimatedSprite()
    sprite.clips = {
      idle: { frames: [0], fps: 1 },
      run: { frames: [1], fps: 1 },
    }
    const { machine } = makeMachine(
      {
        idle: { transitions: [{ on: 'signal:run', to: 'run' }] },
        run: {},
      },
      sprite,
    )
    machine.onReady()
    let observedClip: string | undefined
    vi.spyOn(sprite, 'onUpdate').mockImplementation(() => {
      observedClip = sprite.current
    })
    machine.signal('run')
    const result = resolveComponentUpdateSchedule(
      ['AnimatedSprite', 'StateMachine'],
      { AnimatedSprite, StateMachine },
    )
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.cause).join(' '))
    const byName = new Map<string, Component>([
      ['AnimatedSprite', sprite],
      ['StateMachine', machine],
    ])

    for (const name of result.order) byName.get(name)?.onUpdate?.(0.016)

    expect(result.order).toEqual(['StateMachine', 'AnimatedSprite'])
    expect(observedClip).toBe('run')
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

  it('does not re-enter a state the hop loop just landed on, even while the firing signal is still queued', () => {
    // A '*' edge is re-merged into whatever state the loop just entered, so
    // a signal that has not been cleared yet (signals.clear() only runs
    // after the whole loop) keeps firing on every remaining hop. Without a
    // same-state guard this replays onExit/onEnter for 'target' up to 7
    // more times within the single frame that entered it.
    const enters: string[] = []
    const exits: string[] = []
    const { machine } = makeMachine({
      idle: {},
      target: { transitions: [{ on: 'timer:0.8', to: 'idle' }] },
      '*': { transitions: [{ on: 'signal:go', to: 'target' }] },
    })
    machine.on('target', {
      onEnter: () => enters.push('target'),
      onExit: () => exits.push('target'),
    })
    machine.onReady()
    machine.signal('go')

    machine.onUpdate(0.016)

    expect(machine.current).toBe('target')
    expect(enters).toEqual(['target'])
    expect(exits).toEqual([])
  })

  it('dispatches collision hooks for wildcard and current state with context and other', () => {
    const calls: Array<{ phase: string; ctxEntity: Entity; other: Entity }> = []
    const other = otherEntity('Other')
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

    machine.onCollide(otherEntity('First'))
    machine.goto('own')
    machine.onCollide(otherEntity('Second'))

    expect(calls).toEqual(['default', 'own'])
  })

  it('stops at the wildcard hook when it destroys its own entity', () => {
    const calls: string[] = []
    const harness = makeMachine({ idle: {} })
    defineStates('collision-self-destroy', {
      '*': {
        onCollide: () => {
          calls.push('wildcard')
          harness.kill()
        },
      },
      idle: { onCollide: () => calls.push('current') },
    })
    harness.machine.role = 'collision-self-destroy'
    harness.machine.onReady()

    harness.machine.onCollide(otherEntity('Other'))

    expect(calls).toEqual(['wildcard'])
  })

  it('stops at the wildcard hook when it destroys the other side', () => {
    const calls: string[] = []
    const other = { name: 'Other', alive: true }
    defineStates('collision-other-destroy', {
      '*': {
        onCollide: () => {
          calls.push('wildcard')
          other.alive = false
        },
      },
      idle: { onCollide: () => calls.push('current') },
    })
    const { machine } = makeMachine({ idle: {} })
    machine.role = 'collision-other-destroy'
    machine.onReady()

    machine.onCollide(other as unknown as Entity)

    expect(calls).toEqual(['wildcard'])
  })

  it('delivers the contact to the state that was active, not one the wildcard entered', () => {
    const calls: string[] = []
    defineStates('collision-transition', {
      '*': {
        onCollide: (ctx) => {
          calls.push('wildcard')
          ctx.fsm.goto('hurt')
        },
      },
      idle: { onCollide: () => calls.push('idle') },
      hurt: { onCollide: () => calls.push('hurt') },
    })
    const { machine } = makeMachine({ idle: {}, hurt: {} })
    machine.role = 'collision-transition'
    machine.onReady()

    machine.onCollide(otherEntity('Other'))

    expect(calls).toEqual(['wildcard', 'idle'])
    expect(machine.current).toBe('hurt')
  })

  it('stays quiet when neither the state nor its set defines a collision hook', () => {
    const { machine } = makeMachine({ idle: {} })
    machine.onReady()

    expect(() => machine.onCollide(otherEntity('Other'))).not.toThrow()
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
