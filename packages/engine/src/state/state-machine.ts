import { Component } from '../component.js'
import { AnimatedSprite } from '../components/animated-sprite.js'
import type { Entity } from '../entity.js'
import {
  closestLogicSet,
  logicSet,
  registeredLogicSets,
  type StateContext,
  type StateHooks,
} from './hooks.js'

/** One outgoing edge: when `on` fires, the machine moves to `to`. */
export interface StateTransitionJson {
  /** Trigger: 'input:<action>' | 'timer:<seconds>' | 'signal:<name>'. */
  on: string
  to: string
}

/**
 * One state, as prefab data. Its code (if any) is looked up by state name
 * in the machine's logic set. The '*' state key holds from-any-state
 * transitions instead of a real state.
 */
export interface StateJson {
  /** Clip reference resolved against the sibling AnimatedSprite; defaults to the state's name. */
  clip?: string
  transitions?: StateTransitionJson[]
}

/** What a trigger string is checked against. */
export interface TriggerEnv {
  /** An unconsumed press of the action this frame (see Input.consume). */
  justPressed(action: string): boolean
  /** Seconds spent in the current state. */
  elapsed: number
  signals: ReadonlySet<string>
}

/** Whether one trigger fires. Unknown or malformed triggers never fire. */
export function evaluateTrigger(on: string, env: TriggerEnv): boolean {
  const sep = on.indexOf(':')
  if (sep <= 0) return false
  const kind = on.slice(0, sep)
  const arg = on.slice(sep + 1)
  if (kind === 'input') return env.justPressed(arg)
  if (kind === 'timer') return env.elapsed >= Number(arg)
  if (kind === 'signal') return env.signals.has(arg)
  return false
}

/** The first firing transition: the state's own edges, then '*''s. */
export function nextTransition(
  states: Record<string, StateJson>,
  current: string,
  env: TriggerEnv,
): StateTransitionJson | undefined {
  const edges = [...(states[current]?.transitions ?? []), ...(states['*']?.transitions ?? [])]
  return edges.find((t) => evaluateTrigger(t.on, env))
}

/**
 * The hooks that actually run for one phase of a state: the state's own
 * (logic set + instance), or — when none of them define the phase — the
 * set's 'default' entry. A custom state keeps the role's stock body
 * update unless it brings its own.
 */
export function phaseHooks(
  hooks: StateHooks[],
  fallback: StateHooks | undefined,
  phase: keyof StateHooks,
): StateHooks[] {
  if (hooks.some((h) => h[phase])) return hooks
  return fallback?.[phase] ? [fallback] : hooks
}

/**
 * Finite state machine: the single owner of a character's per-frame
 * logic — only the active state's code moves the body, so behaviors
 * never fight over velocity. States and transitions are prefab data;
 * state code lives in the role's logic set (defineRole / defineStates)
 * picked by `role`. Entering a state plays the sibling AnimatedSprite
 * clip of the same name (or the state's `clip` override); a missing
 * clip warns and keeps the previous one.
 */
export class StateMachine extends Component {
  static override componentName = 'StateMachine'
  static override displayName = 'State Machine'
  static override params = {
    role: { label: 'Role' },
  }

  /** The character's role — names the logic set providing its state code. */
  role = ''
  /** Starting state; defaults to the first declared state. */
  initial = ''
  states: Record<string, StateJson> = {}

  /** Active state name. */
  current = ''
  /** Seconds spent in the active state. */
  elapsed = 0

  private readonly instanceHooks = new Map<string, StateHooks[]>()
  private readonly signals = new Set<string>()
  private readonly warnedClips = new Set<string>()

  override onReady(): void {
    if (this.role && !logicSet(this.role)) {
      const sets = registeredLogicSets()
      const hint = closestLogicSet(this.role)
      console.error(
        `[waica] "${this.entity.name}": role "${this.role}" has no registered state code. ` +
          `Known: ${sets.length ? sets.join(', ') : '(none)'}.` +
          (hint ? ` Did you mean "${hint}"?` : ''),
      )
    }
    const start = this.initial || Object.keys(this.states).find((name) => name !== '*')
    if (start) this.enter(start)
  }

  /** Adds instance-level hooks on top of the logic set — the escape hatch. */
  on(state: string, hooks: StateHooks): void {
    const list = this.instanceHooks.get(state) ?? []
    list.push(hooks)
    this.instanceHooks.set(state, list)
  }

  /** Queues a signal for 'signal:<name>' transitions, consumed this frame or the next. */
  signal(name: string): void {
    this.signals.add(name)
  }

  /** Jumps straight to a state, ignoring transitions. */
  goto(state: string): void {
    if (state !== this.current) this.enter(state)
  }

  override onUpdate(dt: number): void {
    if (!this.current) return
    this.run('*', 'onUpdate', dt)
    this.run(this.current, 'onUpdate', dt)
    this.elapsed += dt
    // Chained transitions settle within the frame (e.g. land → idle → run),
    // capped so a degenerate cyclic graph can't hang the loop.
    for (let hops = 0; hops < 8; hops++) {
      const edge = nextTransition(this.states, this.current, this.env())
      if (!edge) break
      // A transition fired by a key press spends it: one press, one
      // transition — it can't fire again from the state just entered.
      if (edge.on.startsWith('input:')) this.game.input.consume(edge.on.slice('input:'.length))
      this.enter(edge.to)
    }
    this.signals.clear()
  }

  override onCollide(other: Entity): void {
    // The state that was active when the contact happened owns it: a
    // transition fired inside the always-hook must not hand the collision
    // to the state it just entered.
    const state = this.current
    if (!state) return
    this.runCollision('*', other)
    // Either side can be destroyed by a hook. Game.dispatchCollisions guards
    // the same way between the two sides of one contact.
    if (!this.entity.alive || !other.alive) return
    this.runCollision(state, other)
  }

  private env(): TriggerEnv {
    return {
      justPressed: (action) =>
        this.game.input.justPressed(action) && !this.game.input.consumed(action),
      elapsed: this.elapsed,
      signals: this.signals,
    }
  }

  private hooksFor(state: string): StateHooks[] {
    const fromSet = this.role ? logicSet(this.role)?.[state] : undefined
    return [...(fromSet ? [fromSet] : []), ...(this.instanceHooks.get(state) ?? [])]
  }

  private run(state: string, phase: 'onEnter' | 'onUpdate' | 'onExit', dt = 0): void {
    const ctx: StateContext = { entity: this.entity, game: this.game, fsm: this }
    const fallback = state !== '*' && this.role ? logicSet(this.role)?.['default'] : undefined
    for (const hooks of phaseHooks(this.hooksFor(state), fallback, phase)) {
      if (phase === 'onUpdate') hooks.onUpdate?.(ctx, dt)
      else hooks[phase]?.(ctx)
    }
  }

  private runCollision(state: string, other: Entity): void {
    const ctx: StateContext = { entity: this.entity, game: this.game, fsm: this }
    const fallback = state !== '*' && this.role ? logicSet(this.role)?.['default'] : undefined
    for (const hooks of phaseHooks(this.hooksFor(state), fallback, 'onCollide')) {
      hooks.onCollide?.(ctx, other)
    }
  }

  private enter(state: string): void {
    if (this.current) this.run(this.current, 'onExit')
    this.current = state
    this.elapsed = 0
    this.playClip(state)
    this.run(state, 'onEnter')
  }

  private playClip(state: string): void {
    const sprite = this.entity.get(AnimatedSprite)
    if (!sprite) return
    const clip = this.states[state]?.clip ?? state
    if (sprite.clips[clip]) {
      sprite.play(clip)
    } else if (!this.warnedClips.has(state)) {
      this.warnedClips.add(state)
      console.warn(
        `[waica] "${this.entity.name}": no clip "${clip}" for state "${state}" — ` +
          `keeping "${sprite.current ?? 'none'}"`,
      )
    }
  }
}
