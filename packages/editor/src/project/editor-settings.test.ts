import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_SETTINGS,
  parseEditorSettings,
  serializeEditorSettings,
} from './editor-settings'

describe('parseEditorSettings', () => {
  it('defaults on a missing file', () => {
    expect(parseEditorSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS)
  })

  it('defaults on broken JSON', () => {
    expect(parseEditorSettings('{oops')).toEqual(DEFAULT_EDITOR_SETTINGS)
  })

  it('round-trips through serialize', () => {
    const settings = { grid: { type: 'square' as const, show: false, snap: true, size: 1 } }
    expect(parseEditorSettings(serializeEditorSettings(settings))).toEqual(settings)
  })

  it('drops junk entries but keeps the valid ones', () => {
    const settings = parseEditorSettings(
      JSON.stringify({
        waicaEditor: 1,
        grid: { type: 'hexagonal', show: 'yes', snap: true, size: -2 },
      }),
    )
    expect(settings.grid.type).toBe('square')
    expect(settings.grid.show).toBe(DEFAULT_EDITOR_SETTINGS.grid.show)
    expect(settings.grid.snap).toBe(true)
    expect(settings.grid.size).toBe(DEFAULT_EDITOR_SETTINGS.grid.size)
  })

  it('rejects sizes below the minimum', () => {
    const text = JSON.stringify({ waicaEditor: 1, grid: { size: 0.001 } })
    expect(parseEditorSettings(text).grid.size).toBe(DEFAULT_EDITOR_SETTINGS.grid.size)
  })
})
