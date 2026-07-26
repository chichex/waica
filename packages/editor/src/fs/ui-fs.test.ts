import { describe, expect, it } from 'vitest'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { MemFS } from './project-fs'
import { loadUiLib } from './ui-fs'

describe('loadUiLib', () => {
  it('loads the project files, keyed by name', async () => {
    const fs = new MemFS('t', { 'src/ui/health.html': '<div class="health"></div>' })
    expect(await loadUiLib(fs)).toEqual({ health: '<div class="health"></div>' })
  })

  it('yields an empty library for a blank project — no hidden archetype pieces', async () => {
    expect(await loadUiLib(new MemFS('t', {}))).toEqual({})
  })

  // A piece the Explorer never showed still resolved in scenes, so deleting
  // the project's own coin-counter.html did not really delete it.
  it('leaves archetype names free when the project has no file for them', async () => {
    const pieces = await loadUiLib(new MemFS('t', { 'src/ui/health.html': '<b>hp</b>' }))
    for (const name of Object.keys(ACTIVE_ARCHETYPE.registry.ui ?? {})) {
      expect(pieces[name]).toBeUndefined()
    }
  })

  it('ignores files that are not .html', async () => {
    const fs = new MemFS('t', { 'src/ui/notes.txt': 'nope', 'src/ui/hud.html': '<b>hi</b>' })
    expect(Object.keys(await loadUiLib(fs))).toEqual(['hud'])
  })
})
