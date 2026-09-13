import { describe, expect, it } from 'vitest'
import {
  consumeSimulationSteps,
  MAX_STEPS_PER_FRAME,
  SIMULATION_STEP,
  snapElapsedToStep,
  STEP_SNAP_TOLERANCE,
} from './fixed-step'

describe('Simulation Step accumulator (CA-2)', () => {
  it('fixes the step at 1/60 s and the per-frame cap at 6 steps', () => {
    expect(SIMULATION_STEP).toBe(1 / 60)
    expect(MAX_STEPS_PER_FRAME).toBe(6)
  })

  it('runs as many whole steps as the accumulated time contains and keeps the rest', () => {
    // 34 ms holds two whole steps (33.33 ms) and 0.67 ms of leftover.
    const twoSteps = consumeSimulationSteps(0, 0.034)
    expect(twoSteps.steps).toBe(2)
    expect(twoSteps.remainder).toBeCloseTo(0.034 - 2 * SIMULATION_STEP, 12)

    // Below one step nothing runs and the whole elapsed time is retained.
    expect(consumeSimulationSteps(0, 0.005)).toEqual({ steps: 0, remainder: 0.005 })

    // A retained remainder counts toward the next frame's steps.
    const carried = consumeSimulationSteps(0.01, 0.01)
    expect(carried.steps).toBe(1)
    expect(carried.remainder).toBeCloseTo(0.02 - SIMULATION_STEP, 12)
  })

  it('caps a frame at 6 steps and drops the time beyond the cap instead of repaying it', () => {
    expect(consumeSimulationSteps(0, 0.3)).toEqual({ steps: 6, remainder: 0 })
    // Exactly at the cap boundary: 100 ms is six whole steps, nothing carried.
    expect(consumeSimulationSteps(0, 0.1)).toEqual({ steps: 6, remainder: 0 })
    // Just under: five steps and the genuine leftover is kept.
    const underCap = consumeSimulationSteps(0, 0.0999)
    expect(underCap.steps).toBe(5)
    expect(underCap.remainder).toBeCloseTo(0.0999 - 5 * SIMULATION_STEP, 12)
    // The 0.1 s clamp is gone: a huge gap still yields the cap, not 6 steps of clamped time.
    expect(consumeSimulationSteps(0.5, 5)).toEqual({ steps: 6, remainder: 0 })
  })

  it('treats a non-finite elapsed as zero instead of poisoning the remainder with NaN', () => {
    expect(consumeSimulationSteps(0, NaN)).toEqual({ steps: 0, remainder: 0 })
    expect(consumeSimulationSteps(0, Infinity)).toEqual({ steps: 0, remainder: 0 })
    // A retained remainder from a healthy previous frame is not discarded.
    expect(consumeSimulationSteps(0.01, NaN)).toEqual({ steps: 0, remainder: 0.01 })
  })

  it('clamps a negative elapsed to zero instead of yielding negative steps', () => {
    expect(consumeSimulationSteps(0, -0.05)).toEqual({ steps: 0, remainder: 0 })
    // A backwards clock must not eat time already retained from before.
    expect(consumeSimulationSteps(0.01, -0.005)).toEqual({ steps: 0, remainder: 0.01 })
  })
})

describe('Frame-rate snapping (ADR 0014)', () => {
  it('snaps a measured duration within tolerance of a step multiple, keeping the discarded diff as residual', () => {
    const target = 2 * SIMULATION_STEP
    const measured = target - 0.002 // 2 ms short, within STEP_SNAP_TOLERANCE (2.5 ms)
    const result = snapElapsedToStep(measured, 0)
    expect(result.elapsed).toBe(target)
    expect(result.residual).toBeCloseTo(measured - target, 12)
  })

  it('does not snap at or beyond the tolerance boundary — the comparison is strict less-than', () => {
    const target = SIMULATION_STEP
    // Exactly at the boundary: not < STEP_SNAP_TOLERANCE, so no snap.
    const atBoundary = target - STEP_SNAP_TOLERANCE
    expect(snapElapsedToStep(atBoundary, 0)).toEqual({ elapsed: atBoundary, residual: 0 })
    // Comfortably beyond it: a genuine partial step, not a coarsened one.
    const beyond = target - STEP_SNAP_TOLERANCE - 0.001
    expect(snapElapsedToStep(beyond, 0)).toEqual({ elapsed: beyond, residual: 0 })
  })

  it('never snaps a duration past the fourth step multiple, even within tolerance of it', () => {
    // Five or more steps already means a hitch: forcing a snap there would
    // be presumptuous (see SNAPPABLE_STEPS).
    const nearFiveSteps = 5 * SIMULATION_STEP - 0.001
    expect(snapElapsedToStep(nearFiveSteps, 0)).toEqual({ elapsed: nearFiveSteps, residual: 0 })
  })

  it('repays a whole step out of the residual once it accumulates to one, instead of letting it grow unbounded', () => {
    // A residual already carrying just over a full step (from prior
    // frames) gets one step repaid into elapsed right away.
    const residual = SIMULATION_STEP + 0.0003
    const result = snapElapsedToStep(SIMULATION_STEP, residual)
    expect(result.elapsed).toBeCloseTo(2 * SIMULATION_STEP, 12)
    expect(result.residual).toBeCloseTo(0.0003, 12)
  })

  it('passes a duration far from any step multiple through unchanged', () => {
    const measured = 1.5 * SIMULATION_STEP
    expect(snapElapsedToStep(measured, 0.001)).toEqual({ elapsed: measured, residual: 0.001 })
  })
})
