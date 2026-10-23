/** How near its target a smoothed parameter snaps onto it. */
const SNAP = 1e-4

/**
 * The named parameters of an Animator (issue #205, ADR 0033): each one
 * approaches the target `setParam` gave it by a first-order lag, a fraction
 * dt / smoothing of the gap per Simulation Step (all of it at once with no
 * smoothing), and snaps onto it within 1e-4. Plain arithmetic, so the value
 * after N steps is the same on every platform. A parameter nobody wrote is 0.
 */
export class AnimatorParams {
  private readonly targets = new Map<string, number>()
  private readonly values = new Map<string, number>()

  /** The smoothed value of `name`. */
  value(name: string): number {
    return this.values.get(name) ?? 0
  }

  /** Aims `name` at `target`; with no smoothing the value is there at once. */
  set(name: string, target: number, smoothing: number): void {
    this.targets.set(name, target)
    if (smoothing > 0) this.values.set(name, this.value(name))
    else this.values.set(name, target)
  }

  /** One step of every parameter toward its target, each at its own smoothing. */
  step(dt: number, smoothingOf: (name: string) => number): void {
    for (const [name, target] of this.targets) {
      const value = this.value(name)
      if (value === target) continue
      const smoothing = smoothingOf(name)
      const next = smoothing > 0 ? value + (target - value) * Math.min(1, dt / smoothing) : target
      this.values.set(name, Math.abs(target - next) < SNAP ? target : next)
    }
  }

  /** Every smoothed value: the `declared` names first (0 until written), then the others written. */
  snapshot(declared: Iterable<string>): Record<string, number> {
    const snapshot: Record<string, number> = {}
    for (const name of declared) snapshot[name] = this.value(name)
    for (const [name, value] of this.values) snapshot[name] = value
    return snapshot
  }
}
