import { describe, expect, it, vi } from 'vitest'
import { Stats } from './stats'

describe('Stats', () => {
  it('starts from the declared initial values', () => {
    const stats = new Stats({ points: 0, lives: 3, doorOpen: false })
    expect(stats.get('points')).toBe(0)
    expect(stats.get('lives')).toBe(3)
    expect(stats.get('doorOpen')).toBe(false)
    expect(stats.get('unknown')).toBeUndefined()
  })

  it('set + add change values and notify subscribers', () => {
    const stats = new Stats({ points: 0 })
    const seen: unknown[] = []
    stats.onChange('points', (value) => seen.push(value))
    stats.set('points', 5)
    expect(stats.add('points', 2)).toBe(7)
    expect(stats.add('points')).toBe(8)
    expect(seen).toEqual([5, 7, 8])
  })

  it('does not notify when the value does not change', () => {
    const stats = new Stats({ lives: 3 })
    const handler = vi.fn()
    stats.onChange('lives', handler)
    stats.set('lives', 3)
    expect(handler).not.toHaveBeenCalled()
  })

  it('creates undeclared stats on write, counting from 0', () => {
    const stats = new Stats()
    expect(stats.count('gems')).toBe(0)
    expect(stats.add('gems', 4)).toBe(4)
    expect(stats.get('gems')).toBe(4)
  })

  it('count treats non-numeric stats as 0', () => {
    const stats = new Stats({ doorOpen: true, name: 'waica' })
    expect(stats.count('doorOpen')).toBe(0)
    expect(stats.count('name')).toBe(0)
  })

  it('reset returns to the initial values and notifies changed stats', () => {
    const stats = new Stats({ points: 0, lives: 3 })
    stats.set('points', 10)
    stats.add('gems', 2)
    const seen: Array<[string, unknown]> = []
    stats.onChange('points', (v) => seen.push(['points', v]))
    stats.onChange('lives', (v) => seen.push(['lives', v]))
    stats.onChange('gems', (v) => seen.push(['gems', v]))
    stats.reset()
    expect(stats.get('points')).toBe(0)
    expect(stats.get('gems')).toBeUndefined()
    expect(seen).toContainEqual(['points', 0])
    expect(seen).toContainEqual(['gems', undefined])
    expect(seen).not.toContainEqual(['lives', 3])
  })

  it('entries lists declared and runtime-created stats', () => {
    const stats = new Stats({ points: 0 })
    stats.add('gems')
    expect(stats.entries()).toEqual([
      ['points', 0],
      ['gems', 1],
    ])
  })

  it('onChange returns an unsubscribe', () => {
    const stats = new Stats()
    const handler = vi.fn()
    const off = stats.onChange('points', handler)
    off()
    stats.set('points', 1)
    expect(handler).not.toHaveBeenCalled()
  })
})
