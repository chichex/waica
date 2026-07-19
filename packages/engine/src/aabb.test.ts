import { describe, expect, it } from 'vitest'
import { aabbOverlap } from './aabb'

describe('aabbOverlap', () => {
  it('detecta superposición', () => {
    expect(aabbOverlap(0, 0, 2, 2, 1, 1, 2, 2)).toBe(true)
  })

  it('no detecta cajas separadas', () => {
    expect(aabbOverlap(0, 0, 2, 2, 5, 0, 2, 2)).toBe(false)
  })

  it('bordes que solo se tocan no cuentan', () => {
    expect(aabbOverlap(0, 0, 2, 2, 2, 0, 2, 2)).toBe(false)
  })

  it('una caja contenida en otra cuenta', () => {
    expect(aabbOverlap(0, 0, 10, 10, 1, 1, 2, 2)).toBe(true)
  })
})
