import {
  installedDirectionalAnimation,
  isAnimationFacingProvider,
  resolveDirectionalClip,
  type AnimationFacingProvider,
} from '../animation/directional.js'
import { isClipTarget, type ClipTarget } from '../animation/clip-target.js'
import { Component } from '../component.js'
import type { Entity } from '../entity.js'
import { MAX_CHAINED_HOPS, SIMULATION_TIME_EPSILON } from '../fixed-step.js'
import {
  closestLogicSet,
  logicSet,
  registeredLogicSets,
  type StateContext,
  type StateHooks,
} from './hooks.js'

/** One outgoing edge: when `on` fires, the machine moves to `to`. */
export interface StateTransitionJson {
  /** Trigger: 'input:<action>' | 'timer:<seconds>' | 'signal:<name>' | 'clip:end'. */
  on: string
  to: string
}

/**
 * One state, as prefab data. Its code (if any) is looked up by state name
 * in the machine's logic set. The '*' state key holds from-any-state
 * transitions instead of a real state.
 */
export interface StateJson {
  /** Clip reference resolved against the sibling Clip Target (an AnimatedSprite or an Animator); defaults to the state's name. */
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
  /** Whether the Clip Target reports its non-looping clip finished (issue #166); false with no target. */
  clipFinished: boolean
}

/** Whether one trigger fires. Unknown or malformed triggers never fire. */
export function evaluateTrigger(on: string, env: TriggerEnv): boolean {
  const sep = on.indexOf(':')
  if (sep <= 0) return false
  const kind = on.slice(0, sep)
  const arg = on.slice(sep + 1)
  if (kind === 'input') return env.justPressed(arg)
  // A float epsilon of tolerance, not half a Simulation Step: `elapsed` is
  // a sum of many SIMULATION_STEP-sized dts, and float error can leave it a
  // hair under an exact multiple (15 additions of 1/60 give
  // 0.24999999999999997, not 0.25), which a bare `>=` would fire one whole
  // step late. A tolerance as wide as half a step instead fired non-multiple
  // durations one whole step early, since a target can sit closer to the
  // step below than to the one it truly belongs to.
  if (kind === 'timer') return env.elapsed + SIMULATION_TIME_EPSILON >= Number(arg)
  if (kind === 'signal') return env.signals.has(arg)
  // The target updates after the machine (updateAfter: ['StateMachine']), so
  // this fires on the Simulation Step after the clip finished, never for a loop.
  if (kind === 'clip') return arg === 'end' && env.clipFinished
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
 * picked by `role`. Entering a state plays the clip of the same name (or
 * the state's `clip` override) through the entity's Clip Target — the
 * first sibling that plays clips, an AnimatedSprite in 2D or an Animator
 * in 3D (issue #166); a missing clip warns and keeps the previous one.
 */
export class StateMachine extends Component {
  static override componentName = 'StateMachine'
  static override displayName = 'State Machine'
  static override params = {
    role: { label: 'Role' },
  }
  static override transient = [
    'current',
    'elapsed',
    'instanceHooks',
    'signals',
    'warnedClips',
    'warnedFlips',
    'lastFacing',
    'requestedClip',
  ]

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
  /** States already warned that their mirrored clip met a target that cannot flip. */
  private readonly warnedFlips = new Set<string>()
  /** Facing last used to resolve a directional clip — detects a turn mid-state. */
  private lastFacing: string | undefined
  /**
   * The clip the current state asked its Clip Target for, undefined when it
   * asked for nothing (no target, or a clip the target lacks). `clip:end`
   * reads only this clip: a one-shot left finished by an earlier state never
   * counts for a state that could not play its own.
   */
  private requestedClip: string | undefined

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
    // The target is found once per step: entering a state never changes it.
    const target = this.clipTarget()
    // Chained transitions settle within the frame (e.g. land → idle → run),
    // capped so a degenerate cyclic graph can't hang the loop.
    for (let hops = 0; hops < MAX_CHAINED_HOPS; hops++) {
      const edge = nextTransition(this.states, this.current, this.env(target))
      // A '*' edge is re-merged against whatever state the loop just
      // entered, so a still-queued signal (signals.clear() only runs after
      // this loop) keeps firing every remaining hop. Without this guard
      // that replays onExit/onEnter on the state hops already settled into
      // — goto() has the same guard for the same reason.
      if (!edge || edge.to === this.current) break
      // A transition fired by a key press spends it: one press, one
      // transition — it can't fire again from the state just entered.
      if (edge.on.startsWith('input:')) this.game.input.consume(edge.on.slice('input:'.length))
      this.enter(edge.to)
    }
    this.signals.clear()
    this.reresolveOnFacingChange()
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

  private env(target: ClipTarget | undefined): TriggerEnv {
    return {
      justPressed: (action) =>
        this.game.input.justPressed(action) && !this.game.input.consumed(action),
      elapsed: this.elapsed,
      signals: this.signals,
      clipFinished:
        this.requestedClip !== undefined && target?.current === this.requestedClip && target.clipFinished,
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
    this.requestedClip = undefined
    const target = this.clipTarget()
    if (!target) return
    const clip = this.states[state]?.clip ?? state
    if (this.playDirectionalClip(target, clip)) return
    if (target.clipNames.includes(clip)) {
      target.play(clip)
      this.requestedClip = clip
    } else if (!this.warnedClips.has(state)) {
      this.warnedClips.add(state)
      console.warn(
        `[waica] "${this.entity.name}": no clip "${clip}" for state "${state}" — ` +
          `keeping "${target.current ?? 'none'}"`,
      )
    }
  }

  /** The Clip Target: the first sibling that plays clips (duck-typed, like the facing provider). */
  private clipTarget(): (Component & ClipTarget) | undefined {
    return this.entity.components.find((c): c is Component & ClipTarget => isClipTarget(c))
  }

  /**
   * Directional resolution: with an installed contract AND a sibling that
   * reports facing, plays state × facing (mirroring included). Returns false
   * to keep the name-based path — no contract, no facing, no playable clip.
   */
  private playDirectionalClip(target: ClipTarget, clip: string): boolean {
    const resolved = this.resolveFacingClip(target, clip)
    if (!resolved) return false
    this.mirror(target, resolved)
    target.play(resolved.clip)
    this.requestedClip = resolved.clip
    return true
  }

  /** State × facing through the installed contract and the target's clips, remembering the facing used; undefined keeps the name-based path. */
  private resolveFacingClip(target: ClipTarget, clip: string): { clip: string; flip: boolean } | undefined {
    const animation = installedDirectionalAnimation()
    if (!animation) return undefined
    const provider = this.facingProvider()
    if (!provider) return undefined
    const facing = provider.getAnimationFacing()
    this.lastFacing = facing
    const names = target.clipNames
    const resolved = resolveDirectionalClip(animation, names, clip, facing)
    if (!resolved.clip || !names.includes(resolved.clip)) return undefined
    return { clip: resolved.clip, flip: resolved.flip }
  }

  /**
   * Applies the resolved mirror. A target without `setFlipX` (an Animator:
   * 3D faces by turning) plays a mirrored clip unmirrored and warns once
   * per state, so a 2D target that forgot its mirror is not silent.
   */
  private mirror(target: ClipTarget, resolved: { clip: string; flip: boolean }): void {
    if (target.setFlipX) {
      target.setFlipX(resolved.flip)
      return
    }
    if (!resolved.flip || this.warnedFlips.has(this.current)) return
    this.warnedFlips.add(this.current)
    console.warn(
      `[waica] "${this.entity.name}": clip "${resolved.clip}" is mirrored for facing "${this.lastFacing ?? ''}", ` +
        'but the Clip Target cannot flip — playing it unmirrored',
    )
  }

  private facingProvider(): (Component & AnimationFacingProvider) | undefined {
    return this.entity.components.find(
      (c): c is Component & AnimationFacingProvider => isAnimationFacingProvider(c),
    )
  }

  /**
   * playDirectionalClip only runs at enter() time (via playClip), so a
   * facing change that doesn't cross a state boundary — turning while
   * still walking, say — never re-resolves the clip on its own. Catch that
   * here every frame: same state, new facing, re-run the resolution. A
   * turn that only mirrors (west playing east flipped) re-applies the
   * mirror and leaves the clip alone — a running one keeps its frame and a
   * finished one-shot keeps its last — so only a turn onto another clip
   * name plays, as re-entering the state would.
   */
  private reresolveOnFacingChange(): void {
    if (!this.current || !installedDirectionalAnimation()) return
    const target = this.clipTarget()
    if (!target) return
    const provider = this.facingProvider()
    if (!provider || provider.getAnimationFacing() === this.lastFacing) return
    const resolved = this.resolveFacingClip(target, this.states[this.current]?.clip ?? this.current)
    if (!resolved) return
    this.mirror(target, resolved)
    if (resolved.clip === target.current) return
    target.play(resolved.clip)
    this.requestedClip = resolved.clip
  }
}
