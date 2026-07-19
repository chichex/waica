import { describe, expect, it } from 'vitest'
import { aabbOverlap } from './aabb'

describe('aabbOverlap', () => {
  it('detects overlap', () => {
    expect(aabbOverlap(0, 0, 2, 2, 1, 1, 2, 2)).toBe(true)
  })

  it('does not detect separate boxes', () => {
    expect(aabbOverlap(0, 0, 2, 2, 5, 0, 2, 2)).toBe(false)
  })

  it('edges that merely touch do not count', () => {
    expect(aabbOverlap(0, 0, 2, 2, 2, 0, 2, 2)).toBe(false)
  })

  it('a box contained in another counts', () => {
    expect(aabbOverlap(0, 0, 10, 10, 1, 1, 2, 2)).toBe(true)
  })
})
