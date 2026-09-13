/**
 * The Simulation Step (ADR 0014): the fixed slice of game time by which the
 * engine advances every component update, however often the display
 * refreshes. An engine constant, not a project setting — the archetypes'
 * feel is tuned against it, and the Runtime Bridge's `step` means exactly
 * one of these.
 */
export const SIMULATION_STEP = 1 / 60

/**
 * The most steps one render frame may run. Beyond it the elapsed time is
 * dropped, never repaid: a machine that cannot keep up falls behind the
 * wall clock instead of spiralling into ever-longer frames. Six steps is
 * 100 ms, the same ceiling the old per-frame clamp imposed.
 */
export const MAX_STEPS_PER_FRAME = 6

/**
 * Floating-point slack for comparing a value built by summing many
 * SIMULATION_STEP-sized deltas (a state's `elapsed`, a countdown, a clip's
 * playback clock) against a target duration. Each addition can leave the
 * sum a hair under the mathematically exact value — 15 additions of 1/60
 * give 0.24999999999999997, not 0.25 — by an error on the order of 1e-15,
 * many orders of magnitude below this. Large enough to call a step-multiple
 * duration exact, far too small to ever mistake a genuinely later step for
 * an earlier one.
 */
export const SIMULATION_TIME_EPSILON = 1e-9

export interface SimulationSteps {
  /** Whole steps this frame runs, 0 through MAX_STEPS_PER_FRAME. */
  steps: number
  /** Seconds carried into the next frame; 0 whenever the cap was hit. */
  remainder: number
}

/**
 * Pure accumulator: from the time retained after the last frame and the
 * seconds elapsed since it, how many whole steps to run now and what to
 * keep. Hitting the cap discards the whole remainder (CA-2). A non-finite
 * or negative `elapsed` (a NaN timestamp delta, a backwards clock) is
 * treated as zero rather than poisoning the remainder or yielding negative
 * steps — hardening against inputs a real rAF timestamp never produces.
 */
export function consumeSimulationSteps(remainder: number, elapsed: number): SimulationSteps {
  const safeElapsed = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0
  const available = remainder + safeElapsed
  const whole = Math.floor(available / SIMULATION_STEP)
  if (whole >= MAX_STEPS_PER_FRAME) return { steps: MAX_STEPS_PER_FRAME, remainder: 0 }
  return { steps: whole, remainder: available - whole * SIMULATION_STEP }
}

/**
 * How far a measured frame duration may sit from a whole number of
 * Simulation Steps and still count as exactly that many (ronda 2
 * correctness fix). Sized to absorb the sub-millisecond jitter a real 60 Hz
 * `requestAnimationFrame` actually shows — timestamp coarsening and float
 * noise put it at roughly 0.1-0.3 ms — without ever mistaking a genuine
 * partial step for one of these snaps.
 */
export const STEP_SNAP_TOLERANCE = 0.00025 // seconds (0.25 ms)

/**
 * Snapping considers only these small step counts: a display sitting
 * exactly on one of the first few Simulation Step boundaries (60 Hz → 1,
 * 30 Hz → 2, and so on) is the case timestamp jitter can push a hair off:
 * higher counts already mean a hitch, where a fraction of a millisecond
 * doesn't matter and forcing a snap would be presumptuous.
 */
const SNAPPABLE_STEPS = 4

export interface SnapResult {
  /** The elapsed time to feed the accumulator: snapped, and possibly resynced. */
  elapsed: number
  /** Time discarded by snapping so far, still owed to (or by) the wall clock. */
  residual: number
}

/**
 * Frame-rate snapping (ADR 0014, ronda 2 correctness): a measured frame
 * duration that lands within STEP_SNAP_TOLERANCE of an exact multiple of
 * SIMULATION_STEP is treated as exactly that multiple. Without this, a
 * display refreshing at exactly 60.00 Hz can measure e.g. 16.6666 ms
 * instead of the true 16.6667 ms — `consumeSimulationSteps` then floors the
 * whole-steps count to 0 that frame and 2 the next, a routine 0/2-step
 * judder at the one refresh rate ADR 0014 calls exact. Applied to the raw
 * per-frame measurement before it ever reaches the accumulator, so
 * `consumeSimulationSteps` itself — and CA-2's 0.034 s / 0.0999 s / 0.005 s
 * examples, each well outside the tolerance — are untouched.
 *
 * Every snap discards `elapsed - target`, which is carried forward in
 * `residual` (ronda 3 correctness) instead of vanishing: a display a hair
 * off 60.00 Hz — 59.94 Hz, the common NTSC-derived panel rate, discards
 * ~0.017 ms every frame — would otherwise drift from the wall clock
 * without bound (measured: -3.6 s/h at 59.94 Hz). Once the accumulated
 * residual reaches a whole Simulation Step, one step is repaid into
 * `elapsed` right away and subtracted back out of the residual, so the
 * simulation is never more than about one step away from the wall clock.
 */
export function snapElapsedToStep(elapsed: number, residual: number): SnapResult {
  for (let steps = 1; steps <= SNAPPABLE_STEPS; steps += 1) {
    const target = steps * SIMULATION_STEP
    if (Math.abs(elapsed - target) < STEP_SNAP_TOLERANCE) {
      const pending = residual + (elapsed - target)
      if (Math.abs(pending) >= SIMULATION_STEP) {
        const repaid = Math.sign(pending) * SIMULATION_STEP
        return { elapsed: target + repaid, residual: pending - repaid }
      }
      return { elapsed: target, residual: pending }
    }
  }
  return { elapsed, residual }
}
