import { Emitter } from './events'

/** A stat's value: points/lives are numbers, flags are booleans, labels strings. */
export type StatValue = number | boolean | string

/**
 * Named game state (points, lives, door-open flags…) declared in the
 * project's src/stats.json. Every new Game starts from the declared initial
 * values; behaviours read and change them and can subscribe to changes.
 */
export class Stats {
  private readonly initial: Record<string, StatValue>
  private values: Record<string, StatValue>
  private readonly emitter = new Emitter()

  constructor(initial: Record<string, StatValue> = {}) {
    this.initial = { ...initial }
    this.values = { ...initial }
  }

  /** Current value; undeclared stats read as undefined. */
  get(name: string): StatValue | undefined {
    return this.values[name]
  }

  /** Numeric read: non-number and undeclared stats count as 0. */
  count(name: string): number {
    const value = this.values[name]
    return typeof value === 'number' ? value : 0
  }

  /** Sets a stat (declared or not) and notifies subscribers on real changes. */
  set(name: string, value: StatValue): void {
    if (this.values[name] === value) return
    this.values[name] = value
    this.emitter.emit(name, value)
  }

  /** Adds delta (default 1) to a numeric stat; undeclared stats start at 0. */
  add(name: string, delta = 1): number {
    const next = this.count(name) + delta
    this.set(name, next)
    return next
  }

  /** Back to the declared initial values, notifying every stat that changed. */
  reset(): void {
    const previous = this.values
    this.values = { ...this.initial }
    for (const name of new Set([...Object.keys(previous), ...Object.keys(this.values)])) {
      if (previous[name] !== this.values[name]) this.emitter.emit(name, this.values[name])
    }
  }

  /** Fires when the named stat changes. Returns the unsubscribe. */
  onChange(name: string, handler: (value: StatValue | undefined) => void): () => void {
    return this.emitter.on(name, handler as (...args: unknown[]) => void)
  }

  /** Every stat with its current value (declared and runtime-created). */
  entries(): Array<[string, StatValue]> {
    return Object.entries(this.values)
  }
}
