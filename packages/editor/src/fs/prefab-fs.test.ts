import { describe, expect, it } from 'vitest'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { MemFS } from './project-fs'
import { loadPrefabLib } from './prefab-fs'

const SLIME = JSON.stringify({ waicaPrefab: 1, type: 'character', components: [] })

describe('loadPrefabLib', () => {
  it('marks only file-backed refs as project refs, defaults still resolve', async () => {
    const fs = new MemFS('t', { 'src/characters/slime.character.json': SLIME })
    const { prefabs, projectRefs } = await loadPrefabLib(fs)
    expect([...projectRefs]).toEqual(['characters/slime'])
    expect(prefabs['characters/player']).toBeDefined()
  })

  it('yields no project refs for a blank project', async () => {
    const { prefabs, projectRefs } = await loadPrefabLib(new MemFS('t', {}))
    expect(projectRefs.size).toBe(0)
    expect(Object.keys(prefabs)).toEqual(Object.keys(ACTIVE_ARCHETYPE.prefabs))
  })

  it('skips malformed files without listing them', async () => {
    const fs = new MemFS('t', { 'src/characters/slime.character.json': '{oops' })
    const { prefabs, projectRefs } = await loadPrefabLib(fs)
    expect(projectRefs.size).toBe(0)
    expect(prefabs['characters/slime']).toEqual(ACTIVE_ARCHETYPE.prefabs['characters/slime'])
  })
})
