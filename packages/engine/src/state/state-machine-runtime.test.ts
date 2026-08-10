import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installDirectionalAnimation, type DirectionalAnimation } from '../animation/directional'
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

describe('StateMachine directional clip resolution', () => {
  const DIRECTIONAL: DirectionalAnimation = {
    directions: ['n', 's', 'e', 'w'],
    fallbacks: { w: { dir: 'e', flip: true } },
    contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
  }

  interface DirectionalHarness {
    machine: StateMachine
    play: ReturnType<typeof vi.spyOn>
    setFlipX: ReturnType<typeof vi.spyOn>
    /** Mutates the facing the sibling AnimationFacingProvider reports, live. */
    setFacing(next: string): void
  }

  function makeDirectionalMachine(clips: string[], facing: string | null): DirectionalHarness {
    const sprite = new AnimatedSprite()
    sprite.clips = Object.fromEntries(clips.map((name) => [name, { frames: [0], fps: 1 }]))
    const play = vi.spyOn(sprite, 'play').mockImplementation(() => {})
    const setFlipX = vi.spyOn(sprite, 'setFlipX').mockImplementation(() => {})
    const game = {
      input: { justPressed: () => false, consumed: () => false, consume: () => {} },
    } as unknown as Game
    let current = facing
    const components: unknown[] = facing === null ? [] : [{ getAnimationFacing: () => current }]
    const entity = {
      name: 'Walker',
      game,
      alive: true,
      components,
      get: (Class: unknown) => (Class === AnimatedSprite ? sprite : undefined),
    } as unknown as Entity
    const machine = new StateMachine()
    machine.entity = entity
    machine.game = game
    machine.states = { walk: {} }
    machine.initial = 'walk'
    return { machine, play, setFlipX, setFacing: (next) => (current = next) }
  }

  it('plays the exact state-facing clip when it exists', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play, setFlipX } = makeDirectionalMachine(['walk-e'], 'e')

    machine.onReady()

    expect(play).toHaveBeenCalledWith('walk-e')
    expect(setFlipX).toHaveBeenCalledWith(false)
  })

  it('mirrors a declared directional fallback', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play, setFlipX } = makeDirectionalMachine(['walk-e'], 'w')

    machine.onReady()

    expect(play).toHaveBeenCalledWith('walk-e')
    expect(setFlipX).toHaveBeenCalledWith(true)
  })

  it('falls back to the base contract chain when no directional clip fits', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play } = makeDirectionalMachine(['idle'], 'n')

    machine.onReady()

    expect(play).toHaveBeenCalledWith('idle')
  })

  it('keeps the name-based path when no contract is installed', () => {
    const { machine, play, setFlipX } = makeDirectionalMachine(['walk'], 'e')

    machine.onReady()

    expect(play).toHaveBeenCalledWith('walk')
    expect(setFlipX).not.toHaveBeenCalled()
  })

  it('keeps the name-based path when no sibling supplies facing', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play, setFlipX } = makeDirectionalMachine(['walk'], null)

    machine.onReady()

    expect(play).toHaveBeenCalledWith('walk')
    expect(setFlipX).not.toHaveBeenCalled()
  })

  it('re-resolves the directional clip when facing changes mid-state', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play, setFlipX, setFacing } = makeDirectionalMachine(['walk-e'], 'e')

    machine.onReady()
    setFacing('w')
    machine.onUpdate(0.016)

    // west has no 'walk-w' clip, so it mirrors the declared w -> e fallback.
    expect(play).toHaveBeenLastCalledWith('walk-e')
    expect(setFlipX).toHaveBeenLastCalledWith(true)
  })

  it('does not re-resolve every frame when facing is unchanged', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const { machine, play, setFlipX } = makeDirectionalMachine(['walk-e'], 'e')

    machine.onReady()
    play.mockClear()
    setFlipX.mockClear()
    machine.onUpdate(0.016)

    expect(play).not.toHaveBeenCalled()
    expect(setFlipX).not.toHaveBeenCalled()
  })

  it('warns once and keeps the previous clip when directional resolution dead-ends with nothing to fall back to', () => {
    installDirectionalAnimation(DIRECTIONAL)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 'walk-n' exists, but facing is 'e' (no declared e -> n fallback) and
    // neither 'walk' nor the base contract's 'idle' has a bare or
    // directional clip in this set — a true dead end.
    const { machine, play } = makeDirectionalMachine(['walk-n'], 'e')

    machine.onReady()

    expect(play).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[waica] "Walker": no clip "walk" for state "walk" — keeping "none"',
    )
    warn.mockRestore()
  })
})
