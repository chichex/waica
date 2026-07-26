import { describe, expect, it } from 'vitest'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { MemFS } from './project-fs'
import { loadPrefabLib } from './prefab-fs'

const SLIME = JSON.stringify({ waicaPrefab: 1, type: 'character', components: [] })

describe('loadPrefabLib', () => {
  it('loads the project files, keyed by ref', async () => {
    const fs = new MemFS('t', { 'src/characters/slime.character.json': SLIME })
    const prefabs = await loadPrefabLib(fs)
    expect(Object.keys(prefabs)).toEqual(['characters/slime'])
    expect(prefabs['characters/slime']).toEqual(JSON.parse(SLIME))
  })

  it('reads all three prefab dirs, ignoring foreign files', async () => {
    const fs = new MemFS('t', {
      'src/characters/hero.character.json': SLIME,
      'src/objects/gem.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [] }),
      'src/tiles/ground.tile.json': JSON.stringify({ waicaPrefab: 1, type: 'tile', components: [] }),
      'src/characters/notes.txt': 'not a prefab',
    })
    expect(Object.keys(await loadPrefabLib(fs)).sort()).toEqual([
      'characters/hero',
      'objects/gem',
      'tiles/ground',
    ])
  })

  it('yields an empty library for a blank project — no hidden archetype defaults', async () => {
    expect(await loadPrefabLib(new MemFS('t', {}))).toEqual({})
  })

  // A default the Explorer never showed used to occupy its ref anyway, so
  // renaming a prefab to 'player' hit "already exists" against a ghost.
  it('leaves archetype names free when the project has no file for them', async () => {
    const fs = new MemFS('t', { 'src/characters/slime.character.json': SLIME })
    const prefabs = await loadPrefabLib(fs)
    for (const ref of Object.keys(ACTIVE_ARCHETYPE.prefabs)) {
      if (ref === 'characters/slime') continue
      expect(prefabs[ref]).toBeUndefined()
    }
  })

  it('skips malformed files', async () => {
    const fs = new MemFS('t', { 'src/characters/slime.character.json': '{oops' })
    expect(await loadPrefabLib(fs)).toEqual({})
  })
})
