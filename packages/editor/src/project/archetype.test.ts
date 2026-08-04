import { ARCHETYPE } from '@waica/archetype-platformer'
import { describe, expect, it } from 'vitest'
import archetypeSource from './archetype.ts?raw'
import { parseGameSettings } from './game'
import { DEFAULT_ARCHETYPE_ID, resolveArchetype } from './archetype'

describe('runtime archetype resolution', () => {
  it('delegates the platformer entry to the package manifest', () => {
    expect(archetypeSource).toContain("import { ARCHETYPE } from '@waica/archetype-platformer'")
    expect(archetypeSource).not.toContain('PLATFORMER_')
    expect(resolveArchetype('platformer')).toBe(ARCHETYPE)
  })

  it.each(['toString', 'constructor', '__proto__'])(
    'falls back safely for the prototype-colliding id %s',
    (id) => {
      expect(resolveArchetype(id)).toBe(ARCHETYPE)
    },
  )

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
