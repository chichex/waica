import { describe, expect, it } from 'vitest'
import { PLAN_BY_KIND } from './page/scenarios.ts'
import { SCENARIOS } from './results.ts'
import { SWEEP, cellSize } from './sweep.ts'

describe('SWEEP', () => {
  it('lists every scenario id with its kind and size', () => {
    expect(SWEEP).toEqual({
      'static-sprites-1000': { kind: 'static-sprites', n: 1000 },
      'static-sprites-5000': { kind: 'static-sprites', n: 5000 },
      'static-sprites-20000': { kind: 'static-sprites', n: 20000 },
      'spawn-churn-10': { kind: 'spawn-churn', n: 10 },
      'spawn-churn-50': { kind: 'spawn-churn', n: 50 },
      'spawn-churn-200': { kind: 'spawn-churn', n: 200 },
      'animated-sprites-500': { kind: 'animated-sprites', n: 500 },
      'animated-sprites-2000': { kind: 'animated-sprites', n: 2000 },
      'bullet-hell-10': { kind: 'bullet-hell', n: 10 },
      'bullet-hell-20': { kind: 'bullet-hell', n: 20 },
      'bullet-hell-40': { kind: 'bullet-hell', n: 40 },
      'lights-occlusion-8': { kind: 'lights-occlusion', n: 8 },
      'lights-occlusion-32': { kind: 'lights-occlusion', n: 32 },
    })
  })

  it('runs the scenarios in sweep order, and every one has a plan', () => {
    expect(SCENARIOS).toEqual(Object.keys(SWEEP))
    for (const name of SCENARIOS) expect(PLAN_BY_KIND[SWEEP[name].kind]).toBeTypeOf('function')
  })
})

describe('cellSize', () => {
  it('sizes a sprite to 80% of its grid cell, so neighbours never overlap', () => {
    for (const count of [300, 1000, 5000, 20000]) {
      const size = cellSize(count)
      const cols = Math.ceil(Math.sqrt((count * 16) / 9))
      const rows = Math.ceil(count / cols)
      expect(size).toBeLessThan(Math.min(16 / cols, 9 / rows))
      expect(size).toBeCloseTo(0.8 * Math.min(16 / cols, 9 / rows), 6)
    }
  })
})
