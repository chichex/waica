import { describe, expect, it } from 'vitest'
import { ARCHETYPE_CATALOG, resolveArchetype } from './archetype'

describe('ARCHETYPE_CATALOG', () => {
  it('ships the topdown card ready, with the depth-sorted blurb', () => {
    const card = ARCHETYPE_CATALOG['2d'].find((candidate) => candidate.id === 'topdown')
    expect(card).toMatchObject({
      status: 'ready',
      blurb: 'Zelda-style overhead view: 8-direction movement with depth-sorted drawing.',
    })
  })

  it('ships the isometric card ready with its existing icon and blurb', () => {
    const card = ARCHETYPE_CATALOG['2d'].find((candidate) => candidate.id === 'isometric')
    expect(card).toMatchObject({
      icon: '💎',
      label: 'Isometric',
      status: 'ready',
      blurb: '8-direction movement with automatic animation mirroring.',
    })
  })

  it('backs every ready card with a resolvable manifest of the same id', () => {
    const ready = Object.values(ARCHETYPE_CATALOG)
      .flat()
      .filter((card) => card.status === 'ready')
    expect(ready.length).toBeGreaterThanOrEqual(2)
    for (const card of ready) {
      expect(resolveArchetype(card.id).id, card.id).toBe(card.id)
    }
  })
})
