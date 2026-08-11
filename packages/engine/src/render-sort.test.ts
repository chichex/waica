import { describe, expect, it } from 'vitest'
import { AnimatedSprite } from './components/animated-sprite'
import { Sprite } from './components/sprite'
import { isYSortParticipant, ySortZ } from './render-sort'

describe('ySortZ', () => {
  it('renders lower Y in front within a layer', () => {
    const z = ySortZ([
      { layer: 0, y: 2 },
      { layer: 0, y: -2 },
    ])
    expect(z[1]).toBeGreaterThan(z[0]!)
  })

  it('keeps the layer as the primary band regardless of Y', () => {
    const z = ySortZ([
      { layer: 1, y: -1000 },
      { layer: 2, y: 1000 },
    ])
    expect(z[1]).toBeGreaterThan(z[0]!)
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
    expect(z[0]).toBeLessThan(z[1]!)
    expect(z[1]).toBeLessThan(z[2]!)
  })

  it('caps a fractional layer band at the gap to the next distinct layer, however extreme Y gets', () => {
    const ys = [-5000, -1, 1, 5000]
    const z = ySortZ([
      ...ys.map((y) => ({ layer: 0, y })),
      ...ys.map((y) => ({ layer: 0.5, y })),
    ])
    const layer0 = z.slice(0, 4)
    const layer05 = z.slice(4)
    // Every layer-0 offset stays below every layer-0.5 offset: with enough
    // entries per band the old fixed-0.01-band math let a crowded lower
    // layer bleed into a fractional layer right above it.
    expect(Math.max(...layer0)).toBeLessThan(Math.min(...layer05))
    // Ordering within each band still holds: lower Y renders in front.
    expect(layer0[0]).toBeGreaterThan(layer0[1]!)
    expect(layer0[1]).toBeGreaterThan(layer0[2]!)
    expect(layer0[2]).toBeGreaterThan(layer0[3]!)
    expect(layer05[0]).toBeGreaterThan(layer05[1]!)
  })
})

describe('isYSortParticipant', () => {
  it('admits both stock sprite classes through the opt-in seam', () => {
    expect(isYSortParticipant(new Sprite())).toBe(true)
    expect(isYSortParticipant(new AnimatedSprite())).toBe(true)
  })

  it('rejects values that do not implement the full seam', () => {
    expect(isYSortParticipant(null)).toBe(false)
    expect(isYSortParticipant({})).toBe(false)
    expect(isYSortParticipant({ layer: 3 })).toBe(false)
    expect(isYSortParticipant({ setSortZ() {} })).toBe(false)
  })
})
