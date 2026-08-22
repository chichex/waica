import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARCHETYPE_ID,
  KNOWN_ARCHETYPES,
  knownArchetype,
  knownArchetypeIds,
} from './known-archetypes'

describe('known archetypes', () => {
  it('lists platformer with its package and workspace directory', () => {
    expect(knownArchetype('platformer')).toEqual({
      id: 'platformer',
      packageName: '@waica/archetype-platformer',
      directory: 'archetype-platformer',
    })
  })

  it('lists topdown with its package and workspace directory', () => {
    expect(knownArchetype('topdown')).toEqual({
      id: 'topdown',
      packageName: '@waica/archetype-topdown',
      directory: 'archetype-topdown',
    })
  })

  it('lists isometric with its package and workspace directory', () => {
    expect(knownArchetype('isometric')).toEqual({
      id: 'isometric',
      packageName: '@waica/archetype-isometric',
      directory: 'archetype-isometric',
    })
  })

  it('returns undefined for an unknown id', () => {
    expect(knownArchetype('banana')).toBeUndefined()
    expect(knownArchetype('toString')).toBeUndefined()
  })

  it('keeps the default id in the list', () => {
    expect(knownArchetypeIds()).toContain(DEFAULT_ARCHETYPE_ID)
    expect(knownArchetypeIds()).toHaveLength(KNOWN_ARCHETYPES.length)
  })
})
