import { describe, expect, it, vi } from 'vitest'
import { defined, match, returnedValue } from './test-support'

describe('defined (test support)', () => {
  it('returns a present value unchanged', () => {
    const value = { hp: 3 }
    expect(defined(value)).toBe(value)
    expect(defined(0)).toBe(0)
    expect(defined('')).toBe('')
  })

  it('fails the test with a clear message when the value is missing', () => {
    expect(() => defined(undefined)).toThrow('expected a value, got undefined')
    expect(() => defined(null, 'the Player entity')).toThrow('expected the Player entity, got null')
  })
})

describe('returnedValue and match (test support)', () => {
  it('reads what a mocked call returned and fails on anything else', () => {
    const fn = vi.fn((n: number) => n * 2)
    fn(4)
    expect(returnedValue(fn.mock.results[0])).toBe(8)
    expect(() => returnedValue(fn.mock.results[1])).toThrow('expected a returned call, got no call')
  })

  it('matches like the vitest asymmetric matchers it wraps', () => {
    expect({ id: 'a', n: 2, tags: ['x', 'y'] }).toMatchObject({
      id: match.any(String),
      n: match.anything(),
      tags: match.arrayContaining(['y']),
    })
    expect('frames 1/60').toEqual(match.stringMatching(/1\/60/))
    expect({ a: { b: 1 } }).toEqual(match.objectContaining({ a: match.objectContaining({ b: 1 }) }))
  })
})
