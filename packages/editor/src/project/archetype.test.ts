import { describe, expect, it } from 'vitest'
import { parseGameSettings } from './game'
import { DEFAULT_ARCHETYPE_ID, resolveArchetype } from './archetype'

describe('runtime archetype resolution', () => {
  it('resolves the id persisted by a current project', () => {
    const settings = parseGameSettings(JSON.stringify({ archetype: 'platformer' }))

    expect(resolveArchetype(settings.archetype).id).toBe('platformer')
  })

  it('opens a legacy project without an archetype field as platformer', () => {
    const settings = parseGameSettings(JSON.stringify({ waicaGame: 1 }))

    expect(settings.archetype).toBe(DEFAULT_ARCHETYPE_ID)
    expect(resolveArchetype(settings.archetype).id).toBe('platformer')
  })
})
