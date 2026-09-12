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

export interface SimulationSteps {
  /** Whole steps this frame runs, 0 through MAX_STEPS_PER_FRAME. */
  steps: number
  /** Seconds carried into the next frame; 0 whenever the cap was hit. */
  remainder: number
}

/**
 * Pure accumulator: from the time retained after the last frame and the
 * seconds elapsed since it, how many whole steps to run now and what to
 * keep. Hitting the cap discards the whole remainder (CA-2).
 */
export function consumeSimulationSteps(remainder: number, elapsed: number): SimulationSteps {
  const available = remainder + elapsed
  const whole = Math.floor(available / SIMULATION_STEP)
  if (whole >= MAX_STEPS_PER_FRAME) return { steps: MAX_STEPS_PER_FRAME, remainder: 0 }
  return { steps: whole, remainder: available - whole * SIMULATION_STEP }
}
