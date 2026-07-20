import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_SETTINGS, parseGameSettings, serializeGameSettings } from './game'

describe('parseGameSettings', () => {
  it('defaults on a missing file', () => {
    expect(parseGameSettings(null)).toEqual(DEFAULT_GAME_SETTINGS)
  })

  it('defaults on broken JSON', () => {
    expect(parseGameSettings('{oops')).toEqual(DEFAULT_GAME_SETTINGS)
  })

  it('reads a fixed resolution', () => {
    const text = serializeGameSettings({ resolution: { mode: 'fixed', width: 320, height: 180 } })
    expect(parseGameSettings(text).resolution).toEqual({ mode: 'fixed', width: 320, height: 180 })
  })

  it('drops junk entries but keeps the valid ones', () => {
    const settings = parseGameSettings(
      JSON.stringify({ waicaGame: 1, resolution: { mode: 'fixed', width: -5, height: 'x' } }),
    )
    expect(settings.resolution.mode).toBe('fixed')
    expect(settings.resolution.width).toBe(DEFAULT_GAME_SETTINGS.resolution.width)
    expect(settings.resolution.height).toBe(DEFAULT_GAME_SETTINGS.resolution.height)
  })

  it('round-trips through serialize', () => {
    const settings = { resolution: { mode: 'fill' as const, width: 800, height: 600 } }
    expect(parseGameSettings(serializeGameSettings(settings))).toEqual(settings)
  })
})
