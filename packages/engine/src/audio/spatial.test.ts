import { describe, expect, it } from 'vitest'
import { AUDIO_SPATIAL_DEFAULTS, attenuationForDistance, panForOffset } from './spatial.js'

describe('attenuationForDistance (CA-8)', () => {
  it('is full volume at or inside the reference distance', () => {
    expect(attenuationForDistance(0)).toBe(1)
    expect(attenuationForDistance(AUDIO_SPATIAL_DEFAULTS.referenceDistance)).toBe(1)
    expect(attenuationForDistance(AUDIO_SPATIAL_DEFAULTS.referenceDistance - 0.5)).toBe(1)
  })

  it('is silent at or beyond the max distance', () => {
    expect(attenuationForDistance(AUDIO_SPATIAL_DEFAULTS.maxDistance)).toBe(0)
    expect(attenuationForDistance(AUDIO_SPATIAL_DEFAULTS.maxDistance + 100)).toBe(0)
  })

  it('decreases monotonically between the two boundaries', () => {
    const { referenceDistance, maxDistance } = AUDIO_SPATIAL_DEFAULTS
    const span = maxDistance - referenceDistance
    const a = attenuationForDistance(referenceDistance + span * 0.25)
    const b = attenuationForDistance(referenceDistance + span * 0.5)
    const c = attenuationForDistance(referenceDistance + span * 0.75)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
    expect(a).toBeLessThan(1)
    expect(c).toBeGreaterThan(0)
  })
})

describe('panForOffset (CA-8)', () => {
  it('is centered at zero offset', () => {
    expect(panForOffset(0)).toBe(0)
  })

  it('pans right (positive) for a positive offset, left (negative) for a negative one', () => {
    expect(panForOffset(1)).toBeGreaterThan(0)
    expect(panForOffset(-1)).toBeLessThan(0)
  })

  it('clamps to [-1, 1] beyond the pan distance', () => {
    expect(panForOffset(AUDIO_SPATIAL_DEFAULTS.panDistance * 10)).toBe(1)
    expect(panForOffset(-AUDIO_SPATIAL_DEFAULTS.panDistance * 10)).toBe(-1)
  })

  it('is antisymmetric', () => {
    expect(panForOffset(2)).toBeCloseTo(-panForOffset(-2), 10)
  })
})
