import { describe, expect, it } from 'vitest'
import { FRAME_BUDGET_MS, LOOP_END_MARK, LOOP_START_MARK, frameVerdict, gcPausesFromTrace, isOverBudget, summarizeFrames } from './timings.ts'

describe('summarizeFrames', () => {
  it('reports the frame count, median and p95', () => {
    const frames = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(summarizeFrames(frames)).toEqual({ frames: 100, medianMs: 50.5, p95Ms: 95 })
  })

  it('reports zeros for no frames', () => {
    expect(summarizeFrames([])).toEqual({ frames: 0, medianMs: 0, p95Ms: 0 })
  })
})

describe('gcPausesFromTrace', () => {
  it('sums complete MinorGC and MajorGC events, in milliseconds', () => {
    const trace = {
      traceEvents: [
        { name: 'MinorGC', ph: 'X', dur: 1500 },
        { name: 'MajorGC', ph: 'X', dur: 2500 },
        { name: 'FunctionCall', ph: 'X', dur: 9000 },
        { name: 'MinorGC', ph: 'B' },
      ],
    }
    expect(gcPausesFromTrace(JSON.stringify(trace))).toEqual({ count: 2, totalMs: 4 })
  })

  it('skips trace elements that are not objects', () => {
    const trace = { traceEvents: [null, 3, { name: 'MinorGC', ph: 'X', dur: 1000 }] }
    expect(gcPausesFromTrace(JSON.stringify(trace))).toEqual({ count: 1, totalMs: 1 })
  })

  it('counts only GC events inside the measured loop when given its marks', () => {
    const trace = {
      traceEvents: [
        { name: 'MajorGC', ph: 'X', ts: 10, dur: 9000 },
        { name: LOOP_START_MARK, ph: 'R', ts: 100 },
        { name: 'MinorGC', ph: 'X', ts: 150, dur: 2000 },
        { name: LOOP_END_MARK, ph: 'R', ts: 200 },
        { name: 'MinorGC', ph: 'X', ts: 250, dur: 7000 },
      ],
    }
    const loop = { start: LOOP_START_MARK, end: LOOP_END_MARK }
    expect(gcPausesFromTrace(JSON.stringify(trace), loop)).toEqual({ count: 1, totalMs: 2 })
  })

  it('returns null when the loop marks are missing from the trace', () => {
    const trace = { traceEvents: [{ name: 'MinorGC', ph: 'X', ts: 1, dur: 1000 }] }
    expect(gcPausesFromTrace(JSON.stringify(trace), { start: LOOP_START_MARK, end: LOOP_END_MARK })).toBeNull()
  })

  it('returns null for an unreadable trace', () => {
    expect(gcPausesFromTrace('not json')).toBeNull()
    expect(gcPausesFromTrace('{}')).toBeNull()
  })
})

describe('frame budget', () => {
  it('is one 60 fps frame', () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.667, 3)
  })

  it('is over budget only when p95 exceeds one frame', () => {
    expect(isOverBudget(16.6)).toBe(false)
    expect(isOverBudget(16.7)).toBe(true)
    expect(frameVerdict(16.6)).toBe('within budget')
    expect(frameVerdict(16.7)).toBe('OVER 16.6 ms')
  })
})
