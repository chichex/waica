import { describe, expect, it } from 'vitest'
import { parseStats, serializeStats } from './stats'

describe('parseStats', () => {
  it('returns no declared stats for a missing file', () => {
    expect(parseStats(null)).toEqual({})
  })

  it('reads number, boolean and string values', () => {
    const parsed = parseStats(
      JSON.stringify({
        waicaStats: 1,
        stats: { points: 0, lives: 3, doorOpen: false, title: 'level 1' },
      }),
    )
    expect(parsed).toEqual({ points: 0, lives: 3, doorOpen: false, title: 'level 1' })
  })

  it('drops junk entries and keeps the valid ones', () => {
    const parsed = parseStats(
      JSON.stringify({ waicaStats: 1, stats: { points: 0, bag: { x: 1 }, list: [1] } }),
    )
    expect(parsed).toEqual({ points: 0 })
  })

  it('falls back to no declared stats on invalid JSON', () => {
    expect(parseStats('{not json')).toEqual({})
  })
})

describe('serializeStats', () => {
  it('round-trips through parseStats', () => {
    const stats = { points: 10, lives: 3, doorOpen: true }
    expect(parseStats(serializeStats(stats))).toEqual(stats)
  })

  it('writes the waicaStats marker', () => {
    expect(JSON.parse(serializeStats({}))).toEqual({ waicaStats: 1, stats: {} })
  })
})
