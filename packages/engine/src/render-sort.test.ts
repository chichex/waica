import { describe, expect, it } from 'vitest'
import { ySortZ } from './render-sort'

describe('ySortZ', () => {
  it('renders lower Y in front within a layer', () => {
    const z = ySortZ([
      { layer: 0, y: 2 },
      { layer: 0, y: -2 },
    ])
    expect(z[1]).toBeGreaterThan(z[0])
  })

  it('keeps the layer as the primary band regardless of Y', () => {
    const z = ySortZ([
      { layer: 1, y: -1000 },
      { layer: 2, y: 1000 },
    ])
    expect(z[1]).toBeGreaterThan(z[0])
  })

  it('confines every offset to its own 0.01 layer band', () => {
    const z = ySortZ([
      { layer: 0, y: -5000 },
      { layer: 0, y: 0 },
      { layer: 0, y: 5000 },
      { layer: -1, y: -5000 },
    ])
    for (const [i, entry] of [
      { layer: 0, y: -5000 },
      { layer: 0, y: 0 },
      { layer: 0, y: 5000 },
      { layer: -1, y: -5000 },
    ].entries()) {
      expect(z[i]).toBeGreaterThan(entry.layer * 0.01)
      expect(z[i]).toBeLessThan((entry.layer + 1) * 0.01)
    }
  })

  it('keeps input order for exact Y ties', () => {
    const z = ySortZ([
      { layer: 0, y: 3 },
      { layer: 0, y: 3 },
      { layer: 0, y: 3 },
    ])
    expect(z[0]).toBeLessThan(z[1])
    expect(z[1]).toBeLessThan(z[2])
  })
})
