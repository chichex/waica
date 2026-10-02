import { describe, expect, it } from 'vitest'
import { gcPausesFromTrace, summarizeFrames } from './timings.ts'

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

  it('returns null for an unreadable trace', () => {
    expect(gcPausesFromTrace('not json')).toBeNull()
    expect(gcPausesFromTrace('{}')).toBeNull()
  })
})
