import { Component, StateMachine, type Entity, type StateJson } from '@waica/engine'

/**
 * Below this, current is treated as exactly zero. Repeated fractional
 * damage (e.g. ten hits of 0.1 against max: 1) can leave a floating-point
 * residual — Math.max(0, current - amount) only clamps values that land
 * at or below zero, not tiny positive ones — that current === 0 would
 * otherwise miss forever, leaving the entity undead at 0 HP.
 */
const DEATH_EPSILON = 1e-9

/**
 * Whether a state graph reacts to death on its own: a 'signal:death' edge
 * on the current state or on '*'. Mirrors the merge nextTransition performs,
 * because StateMachine.signal is fire-and-forget — it cannot report whether
 * anybody handled the signal, so the graph is asked statically instead.
 */
export function declaresDeathHandling(
  states: Record<string, StateJson>,
  current: string,
): boolean {
  const edges = [...(states[current]?.transitions ?? []), ...(states['*']?.transitions ?? [])]
  return edges.some((transition) => transition.on === 'signal:death')
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
  static override params = {
    max: { label: 'Max health', min: 1, max: 20, step: 1 },
    invulnerability: { label: 'Invulnerability', min: 0, max: 5, step: 0.1 },
  }
  static override transient = ['current', 'invulnerable']

  max = 3
  /** Seconds of immunity granted by taking a hit. 0 disables i-frames. */
  invulnerability = 0

  /** Health left; 0 is dead. Filled in from max on ready. */
  current = 0

  /** Seconds left in the invulnerability window. */
  private invulnerable = 0

  override onReady(): void {
    this.current = this.max
  }

  override onUpdate(dt: number): void {
    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt)
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
    this.game.events.emit('damage', {
      entity: this.entity,
      amount,
      current: this.current,
      source,
    })
    this.invulnerable = this.invulnerability
    if (this.current === 0) this.die()
  }

  /** Gives health back, capped at max. heal(Infinity) is a full restore. */
  heal(amount: number): void {
    if (amount <= 0) return
    this.current = Math.min(this.max, this.current + amount)
  }

  /**
   * Announces the death, then lets the role decide — but only if it says it
   * can: a graph with no death edge would swallow the signal silently, so
   * destroying is the fallback rather than the exception.
   */
  private die(): void {
    this.game.events.emit('death', { entity: this.entity })
    const machine = this.entity.get(StateMachine)
    if (machine && declaresDeathHandling(machine.states, machine.current)) {
      machine.signal('death')
      return
    }
    this.entity.destroy()
  }
}
