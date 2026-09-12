import { describe, expect, it } from 'vitest'
import { consumeSimulationSteps, MAX_STEPS_PER_FRAME, SIMULATION_STEP } from './fixed-step'

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
})
