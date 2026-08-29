import { Component, StateMachine, type Entity, type StateJson } from '@waica/engine'

/**
 * Below this, current is treated as exactly zero. Repeated fractional
 * damage (e.g. ten hits of 0.1 against max: 1) can leave a floating-point
 * residual — Math.max(0, current - amount) only clamps values that land
 * at or below zero, not tiny positive ones — that current === 0 would
 * otherwise miss forever, leaving the entity undead at 0 HP.
 */
const DEATH_EPSILON = 1e-9

/** Seconds each blink phase lasts while invulnerable: 10 Hz on/off. */
const BLINK_PERIOD = 0.1

/**
 * Where a 'signal:death' from `current` could land: the targets of every
 * death edge on the current state or on '*'. Mirrors the merge
 * nextTransition performs.
 */
export function deathTargets(states: Record<string, StateJson>, current: string): string[] {
  const edges = [...(states[current]?.transitions ?? []), ...(states['*']?.transitions ?? [])]
  return edges.filter((transition) => transition.on === 'signal:death').map((t) => t.to)
}

/**
 * Whether a state graph reacts to death on its own: a 'signal:death' edge
 * on the current state or on '*'. Mirrors the merge nextTransition performs,
 * because StateMachine.signal is fire-and-forget — it cannot report whether
 * anybody handled the signal, so the graph is asked statically instead.
 *
 * Declaring an edge is not the same as taking it: nextTransition returns the
 * FIRST firing edge, so a death edge listed after another edge that also
 * fires loses the race and the signal is dropped. That is why signalling is
 * followed by a check on Health's first eligible update after StateMachine.
 */
export function declaresDeathHandling(
  states: Record<string, StateJson>,
  current: string,
): boolean {
  return deathTargets(states, current).length > 0
}

/**
 * How much punishment an entity takes before it dies. Deliberately separate
 * from Hazard's "hurts on touch": an enemy is both, a spike is only the
 * hazard, and a projectile targets only what can be hurt.
 *
 * There is no kill(): lethality is arithmetic, so damage(Infinity) is the
 * only death path and every death goes through the same policy.
 */
export class Health extends Component {
  static override componentName = 'Health'
  static override updateAfter: readonly string[] = ['StateMachine']
  static override params = {
    max: { label: 'Max health', min: 1, max: 20, step: 1 },
    invulnerability: { label: 'Invulnerability', min: 0, max: 5, step: 0.1 },
    stat: { label: 'Stat', ref: 'stat' as const },
  }
  static override transient = [
    'current',
    'invulnerable',
    'deathPending',
    'expectedStates',
    'lastDamageSource',
    'blinkClock',
  ]

  max = 3
  /** Seconds of immunity granted by taking a hit. 0 disables i-frames. */
  invulnerability = 0
  /**
   * Stat that mirrors `current` (a HUD binds to it with `{{stat}}`). Empty
   * publishes nothing: the stat is the project's to declare.
   */
  stat = ''

  /** Health left; 0 is dead. Filled in from max on ready. */
  current = 0
  /** Whoever dealt the last accepted hit, for the state that reacts to it. */
  lastDamageSource: Entity | undefined

  /** Seconds left in the invulnerability window. */
  private invulnerable = 0
  /** Seconds into the current blink, for the 10 Hz toggle. */
  private blinkClock = 0

  /** Whether the node is being flashed: exactly while a window is open. */
  get blinking(): boolean {
    return this.invulnerable > 0
  }

  /** Whether the signalled death must be checked on this component's next update. */
  private deathPending = false
  /** States the death signal was supposed to reach. */
  private expectedStates: string[] = []

  /**
   * What a Runtime Snapshot shows: the authored values, the live ones, and
   * the last source by name — projecting the whole Entity would drag its
   * scene node along and bury the numbers that matter.
   */
  inspectState(): Record<string, unknown> {
    return {
      max: this.max,
      invulnerability: this.invulnerability,
      stat: this.stat,
      current: this.current,
      invulnerable: this.invulnerable,
      blinking: this.blinking,
      lastDamageSource: this.lastDamageSource?.name ?? null,
    }
  }

  override onReady(): void {
    // The inspector has no min clamp on max, so an authored 0 (or a
    // negative value) is reachable. Without this, current lands at <= 0
    // and stays there forever: damage() early-returns while current <= 0,
    // so die() is never reached — permanently invulnerable instead of
    // already dead.
    this.current = Math.max(0, this.max)
    this.publish()
    if (this.current === 0) this.die()
  }

  override onUpdate(dt: number): void {
    if (this.invulnerable > 0) {
      this.invulnerable = Math.max(0, this.invulnerable - dt)
      this.blink(dt)
    }
    if (this.deathPending) {
      this.deathPending = false
      this.settleDeath()
    }
  }

  /**
   * Makes good on a death the graph said it would handle. Signalling is
   * fire-and-forget, so "it declared an edge" is a promise, not a receipt:
   * if the machine is not in one of the states that edge led to and the
   * entity is still dead, nobody took it and the destroy fallback applies
   * after all. Being healed back up counts as handled — a project that
   * revives on death did resolve it, just not by changing state.
   */
  private settleDeath(): void {
    const expected = this.expectedStates
    this.expectedStates = []
    if (!this.entity.alive || this.current > 0) return
    const machine = this.entity.get(StateMachine)
    if (machine && expected.includes(machine.current)) return
    this.entity.destroy()
  }

  /**
   * Takes `amount` off unless already dead or still invulnerable, then opens
   * the invulnerability window. `source` is whatever dealt the damage, for
   * listeners that care who hit them.
   */
  damage(amount: number, source?: Entity): void {
    // Written as !(amount > 0) rather than amount <= 0 so NaN is rejected
    // too — every NaN comparison is false, so amount <= 0 lets it through
    // and poisons current (NaN - anything is NaN, and every guard against
    // it is false forever after).
    if (!(amount > 0) || this.current <= 0 || this.invulnerable > 0) return
    this.current = Math.max(0, this.current - amount)
    if (this.current < DEATH_EPSILON) this.current = 0
    this.lastDamageSource = source
    this.publish()
    this.game.events.emit('damage', {
      entity: this.entity,
      amount,
      current: this.current,
      source,
    })
    this.invulnerable = this.invulnerability
    this.blinkClock = 0
    if (this.current === 0) {
      this.die()
      return
    }
    // Fire-and-forget, like death: a graph with no 'signal:hurt' edge simply
    // ignores it, so a stunned/knocked-back reaction is the role's to add.
    this.entity.get(StateMachine)?.signal('hurt')
  }

  /** Gives health back, capped at max. heal(Infinity) is a full restore. */
  heal(amount: number): void {
    if (amount <= 0) return
    this.current = Math.min(this.max, this.current + amount)
    this.publish()
  }

  /** Mirrors current into the named stat, when one is named. */
  private publish(): void {
    if (this.stat) this.game.stats.set(this.stat, this.current)
  }

  /**
   * Flashes the node at 10 Hz for as long as the window stays open, and
   * leaves it visible the frame the window closes — the flash is feedback,
   * never a state a hit can leave the entity stuck in.
   */
  private blink(dt: number): void {
    if (this.invulnerable > 0) {
      this.blinkClock += dt
      this.entity.node.visible = Math.floor(this.blinkClock / BLINK_PERIOD) % 2 === 0
      return
    }
    this.entity.node.visible = true
  }

  /**
   * Announces the death, then lets the role decide — but only if it says it
   * can: a graph with no death edge would swallow the signal silently, so
   * destroying is the fallback rather than the exception.
   */
  private die(): void {
    // The killing blow opened a window like any other hit; close it. The
    // death pose must hold steady, and a revived entity starts without
    // leftover immunity. The node is visible here by construction: blink()
    // restores it the frame a window closes, and a lethal hit only lands
    // while no window is open.
    this.invulnerable = 0
    this.blinkClock = 0
    this.game.events.emit('death', { entity: this.entity })
    const machine = this.entity.get(StateMachine)
    const targets = machine ? deathTargets(machine.states, machine.current) : []
    if (machine && targets.length > 0) {
      machine.signal('death')
      // Trust, then verify: the deterministic schedule puts Health after the
      // machine, so its first eligible update can settle this without an
      // authored-order grace period.
      this.expectedStates = targets
      this.deathPending = true
      return
    }
    this.entity.destroy()
  }
}
