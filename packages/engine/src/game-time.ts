import { SIMULATION_STEP, SIMULATION_TIME_EPSILON } from './fixed-step.js'

/** The closed set of named Penner curves a Tween can ease through. */
export type EasingName =
  | 'linear'
  | 'quadIn'
  | 'quadOut'
  | 'quadInOut'
  | 'cubicIn'
  | 'cubicOut'
  | 'cubicInOut'
  | 'sineInOut'

/** A resolved easing: normalized progress in, eased progress out. */
type EasingFn = (t: number) => number

/** What `after`/`every`/`tween` hand back: see CA-6. */
export interface TimerHandle {
  /** Idempotent and silent, even on an already-inactive handle. */
  cancel(): void
  readonly active: boolean
  /** Seconds of Game Time, per-kind semantics in CA-6. Frozen once inactive. */
  readonly elapsed: number
  /** Seconds of Game Time until the next due time; 0 once inactive. */
  readonly remaining: number
}

export interface TimerOptions {
  /**
   * Structural, not `instanceof Entity` (spec inference 19) — an object with
   * a boolean `alive` qualifies, whatever else it is, so behaviors-test stub
   * entities do too. An owner already dead at scheduling time yields an
   * inactive handle that never runs, silently (CA-5) — a real Entity's
   * `destroy()` cancels a live one the same way, whatever its scope.
   */
  owner?: { readonly alive: boolean }
  /**
   * `'session'` survives a scene change; anything else — including leaving
   * it unset — means scene-scoped (ADR 0017), the opposite default from
   * `game.onUpdate`/`game.events` (ADR 0011).
   */
  scope?: string
}

export interface TweenOptions {
  from: number
  to: number
  /** <= 0 (a negative clamped to 0) or below one step: `from` on creation, `to` + onComplete next step. */
  seconds: number
  /** A known name (default `'linear'`) or a custom `(t) => number`. */
  easing?: EasingName | ((t: number) => number)
  onUpdate: (value: number) => void
  onComplete?: () => void
  owner?: { readonly alive: boolean }
  scope?: string
}

const INACTIVE_HANDLE: TimerHandle = Object.freeze({
  cancel(): void {},
  active: false,
  elapsed: 0,
  remaining: 0,
})

const EASINGS: Record<EasingName, EasingFn> = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - (1 - t) ** 3,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
}

function resolveEasing(easing: EasingName | ((t: number) => number) | undefined): EasingFn | null {
  if (easing === undefined) return EASINGS.linear
  if (typeof easing === 'function') return easing
  return Object.prototype.hasOwnProperty.call(EASINGS, easing) ? EASINGS[easing] : null
}

function isValidOwner(owner: unknown): owner is { readonly alive: boolean } {
  return (
    typeof owner === 'object' &&
    owner !== null &&
    typeof (owner as Record<string, unknown>)['alive'] === 'boolean'
  )
}

/** `'session'` survives a scene change; any other value (including absent) means scene. */
function normalizeScope(scope: string | undefined): 'scene' | 'session' {
  return scope === 'session' ? 'session' : 'scene'
}

/** Shared bookkeeping for a timer (`after`/`every`) or a tween. */
interface Entry {
  readonly id: number
  readonly scope: 'scene' | 'session'
  readonly owner?: { readonly alive: boolean }
  active: boolean
  /** Where `elapsed` counts from: creation for `after`/tween, last firing for `every`. */
  referenceStart: number
  /** Next (or only) due Game Time, in seconds. */
  dueTime: number
  /** Game Time at which this became inactive; freezes `elapsed`/`remaining`. */
  deactivatedAt: number | null
}

interface TimerEntry extends Entry {
  readonly kind: 'after' | 'every'
  callback: () => void
  readonly startTime: number
  readonly intervalSeconds: number
  occurrence: number
}

interface TweenEntry extends Entry {
  readonly kind: 'tween'
  readonly from: number
  readonly to: number
  readonly seconds: number
  readonly ease: EasingFn
  onUpdate: (value: number) => void
  onComplete?: () => void
}

/**
 * The `game.time` service (CA-1..CA-9, CA-14): `after`, `every` and `tween`
 * scheduled against Game Time (`now`), advanced only by Simulation Steps —
 * never the wall clock, never synchronously, never while paused or not
 * simulating. Constructible standalone, like `Stats`: a `Game` owns one via
 * `game.time`, and a behaviors-test stub game can carry its own, advanced by
 * the same engine-internal hook `Game` uses (`advanceGameTime`, exported
 * below — not part of this class's documented API).
 */
export class GameTime {
  private stepCount = 0
  private nextId = 0
  private timers: TimerEntry[] = []
  private tweens: TweenEntry[] = []

  /** 0 on a new GameTime; `N * SIMULATION_STEP` exactly after N steps — computed, never summed (CA-9). */
  get now(): number {
    return this.stepCount * SIMULATION_STEP
  }

  /** Active timers plus active tweens across both scopes (CA-10). */
  get pending(): number {
    let count = 0
    for (const timer of this.timers) if (timer.active) count += 1
    for (const tween of this.tweens) if (tween.active) count += 1
    return count
  }

  /** Smallest positive integer n s.t. n more steps fires/completes something; null when nothing is pending (CA-10). */
  get nextInSteps(): number | null {
    let min: number | null = null
    for (const timer of this.timers) {
      if (!timer.active) continue
      min = min === null ? this.stepsUntilDue(timer.dueTime) : Math.min(min, this.stepsUntilDue(timer.dueTime))
    }
    for (const tween of this.tweens) {
      if (!tween.active) continue
      min = min === null ? this.stepsUntilDue(tween.dueTime) : Math.min(min, this.stepsUntilDue(tween.dueTime))
    }
    return min
  }

  /**
   * Runs `callback` once, `seconds` of Game Time from now (0 or a negative
   * duration: the start of the next step). Never synchronous (CA-1).
   */
  after(seconds: number, callback: () => void, options: TimerOptions = {}): TimerHandle {
    if (!Number.isFinite(seconds)) return this.invalid('after(): seconds must be finite')
    if (typeof callback !== 'function') return this.invalid('after(): callback must be a function')
    const owner = options.owner
    if (owner !== undefined && !isValidOwner(owner)) {
      return this.invalid('after(): owner must be an object with a boolean "alive" property')
    }
    if (owner !== undefined && !owner.alive) return INACTIVE_HANDLE
    const effective = Math.max(0, seconds)
    const startTime = this.now
    const entry: TimerEntry = {
      id: this.nextId++,
      kind: 'after',
      scope: normalizeScope(options.scope),
      owner,
      active: true,
      referenceStart: startTime,
      dueTime: startTime + effective,
      deactivatedAt: null,
      callback,
      startTime,
      intervalSeconds: effective,
      occurrence: 1,
    }
    this.timers.push(entry)
    return this.handleFor(entry)
  }

  /**
   * Runs `callback` every `max(seconds, SIMULATION_STEP)` of Game Time,
   * first one interval after creation, with no drift: each due time is
   * `start + n * interval`, computed directly rather than by repeated
   * addition (CA-2).
   */
  every(seconds: number, callback: () => void, options: TimerOptions = {}): TimerHandle {
    if (!Number.isFinite(seconds)) return this.invalid('every(): seconds must be finite')
    if (typeof callback !== 'function') return this.invalid('every(): callback must be a function')
    const owner = options.owner
    if (owner !== undefined && !isValidOwner(owner)) {
      return this.invalid('every(): owner must be an object with a boolean "alive" property')
    }
    if (owner !== undefined && !owner.alive) return INACTIVE_HANDLE
    const interval = Math.max(seconds, SIMULATION_STEP)
    const startTime = this.now
    const entry: TimerEntry = {
      id: this.nextId++,
      kind: 'every',
      scope: normalizeScope(options.scope),
      owner,
      active: true,
      referenceStart: startTime,
      dueTime: startTime + interval,
      deactivatedAt: null,
      callback,
      startTime,
      intervalSeconds: interval,
      occurrence: 1,
    }
    this.timers.push(entry)
    return this.handleFor(entry)
  }

  /**
   * Carries a single number from `from` to `to` over `seconds` of Game
   * Time, reporting it through `onUpdate` on every step including creation
   * (synchronous, before this returns — CA-7). Owner already dead, or any
   * invalid input, skips even that first call.
   */
  tween(options: TweenOptions): TimerHandle {
    const { from, to, seconds, onUpdate, onComplete } = options
    if (!Number.isFinite(seconds)) return this.invalid('tween(): seconds must be finite')
    if (!Number.isFinite(from)) return this.invalid('tween(): from must be finite')
    if (!Number.isFinite(to)) return this.invalid('tween(): to must be finite')
    if (typeof onUpdate !== 'function') return this.invalid('tween(): onUpdate must be a function')
    if (onComplete !== undefined && typeof onComplete !== 'function') {
      return this.invalid('tween(): onComplete must be a function when present')
    }
    const ease = resolveEasing(options.easing)
    if (!ease) return this.invalid('tween(): easing must be a known name or a function')
    const owner = options.owner
    if (owner !== undefined && !isValidOwner(owner)) {
      return this.invalid('tween(): owner must be an object with a boolean "alive" property')
    }
    if (owner !== undefined && !owner.alive) return INACTIVE_HANDLE
    const effective = Math.max(0, seconds)
    const createdAt = this.now
    const entry: TweenEntry = {
      id: this.nextId++,
      kind: 'tween',
      scope: normalizeScope(options.scope),
      owner,
      active: true,
      referenceStart: createdAt,
      dueTime: createdAt + effective,
      deactivatedAt: null,
      from,
      to,
      seconds: effective,
      ease,
      onUpdate,
      onComplete,
    }
    // Registers nothing if this throws (CA-7): the entry is only pushed after.
    onUpdate(from)
    this.tweens.push(entry)
    return this.handleFor(entry)
  }

  /**
   * Internal: the start-of-step pass (CA-3) — advances `now`, then runs
   * every due timer (due time, then creation order), then advances every
   * tween that existed before this pass (creation order). Call only through
   * `advanceGameTime()`; never from project code.
   */
  advanceStep(): void {
    this.stepCount += 1
    this.runDueTimers()
    this.advanceTweens()
    this.timers = this.timers.filter((timer) => timer.active)
    this.tweens = this.tweens.filter((tween) => tween.active)
  }

  /** Internal: called by `Game.unloadScene()` and every scene load, including the first (CA-4). */
  cancelSceneScoped(): void {
    for (const timer of this.timers) if (timer.scope !== 'session') this.deactivate(timer)
    for (const tween of this.tweens) if (tween.scope !== 'session') this.deactivate(tween)
  }

  /** Internal: called by `Entity.destroy()` (CA-5). */
  cancelOwnedBy(owner: { readonly alive: boolean }): void {
    for (const timer of this.timers) if (timer.owner === owner) this.deactivate(timer)
    for (const tween of this.tweens) if (tween.owner === owner) this.deactivate(tween)
  }

  /** Internal: called by `Game.dispose()` (CA-4). */
  cancelAll(): void {
    for (const timer of this.timers) this.deactivate(timer)
    for (const tween of this.tweens) this.deactivate(tween)
  }

  private runDueTimers(): void {
    const due = this.timers
      .filter((timer) => timer.active && timer.dueTime <= this.now + SIMULATION_TIME_EPSILON)
      .sort((a, b) => a.dueTime - b.dueTime || a.id - b.id)
    for (const timer of due) {
      if (!timer.active) continue // an earlier callback this same pass may have cancelled it
      if (timer.kind === 'every') {
        timer.referenceStart = timer.dueTime
        timer.occurrence += 1
        timer.dueTime = timer.startTime + timer.occurrence * timer.intervalSeconds
      } else {
        timer.active = false
        timer.deactivatedAt = timer.dueTime
      }
      timer.callback()
    }
  }

  private advanceTweens(): void {
    for (const tween of [...this.tweens]) {
      if (!tween.active) continue
      if (tween.dueTime <= this.now + SIMULATION_TIME_EPSILON) {
        tween.active = false
        tween.deactivatedAt = tween.dueTime
        tween.onUpdate(tween.to)
        tween.onComplete?.()
        continue
      }
      const elapsed = this.now - tween.referenceStart
      const t = Math.min(elapsed / tween.seconds, 1)
      tween.onUpdate(tween.from + (tween.to - tween.from) * tween.ease(t))
    }
  }

  private deactivate(entry: Entry): void {
    if (!entry.active) return
    entry.active = false
    entry.deactivatedAt = this.now
  }

  /** Smallest n >= 1 such that `n` more steps reaches `dueTime`, guarding against float noise near a step boundary. */
  private stepsUntilDue(dueTime: number): number {
    const raw = (dueTime - this.now) / SIMULATION_STEP
    const n = Math.ceil(raw - SIMULATION_TIME_EPSILON / SIMULATION_STEP)
    return Math.max(1, n)
  }

  private invalid(message: string): TimerHandle {
    console.warn(`[waica] ${message}`)
    return INACTIVE_HANDLE
  }

  private handleFor(entry: Entry): TimerHandle {
    const time = this
    return {
      cancel(): void {
        time.deactivate(entry)
      },
      get active(): boolean {
        return entry.active
      },
      get elapsed(): number {
        const end = entry.deactivatedAt ?? time.now
        return Math.max(0, end - entry.referenceStart)
      },
      get remaining(): number {
        if (!entry.active) return 0
        return Math.max(0, entry.dueTime - time.now)
      },
    }
  }
}

/**
 * Engine-internal: advances `time` by exactly one Simulation Step (CA-3).
 * `Game.simulateStep()` calls this as its very first statement, so nothing
 * advances with `simulate === false`, on a zero-step frame, or while the
 * Runtime Bridge is paused and not stepping. A standalone `GameTime` — a
 * behaviors-test stub game, or this package's own game-time.test.ts (CA-14)
 * — must call this the same way. Not part of `GameTime`'s documented API,
 * like `resetRegistries`: project code must never call it directly, or Game
 * Time desynchronizes from the real simulation.
 */
export function advanceGameTime(time: GameTime): void {
  time.advanceStep()
}
