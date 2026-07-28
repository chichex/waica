import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWorkspace, saveWorkspace } from './workspace'

// In-memory localStorage: the suite runs in the default node environment.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
})

describe('workspace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the open scene and view per project', () => {
    saveWorkspace('game-a', 'src/scenes/main.scene.json', { kind: 'prefab', ref: 'characters/slime' })
    saveWorkspace('game-b', 'src/scenes/other.scene.json', { kind: 'controls' })
    expect(loadWorkspace('game-a')).toEqual({
      openScenePath: 'src/scenes/main.scene.json',
      view: { kind: 'prefab', ref: 'characters/slime' },
    })
    expect(loadWorkspace('game-b')).toEqual({
      openScenePath: 'src/scenes/other.scene.json',
      view: { kind: 'controls' },
    })
  })

  it('returns null for a project never saved', () => {
    expect(loadWorkspace('nope')).toBeNull()
  })

  it('drops art views: their blob URLs die with the session', () => {
    saveWorkspace('game', 'src/scenes/main.scene.json', {
      kind: 'art',
      label: 'slime.png',
      url: 'blob:dead',
      path: 'src/art/slime.png',
    })
    expect(loadWorkspace('game')).toEqual({
      openScenePath: 'src/scenes/main.scene.json',
      view: null,
    })
  })

  it('keeps every serializable view kind', () => {
    const views = [
      { kind: 'scene', path: 'src/scenes/main.scene.json' },
      { kind: 'stateFile', path: 'src/states/dash.ts' },
      { kind: 'ui', name: 'hud' },
      { kind: 'script', name: 'Patrol' },
      { kind: 'stats' },
      { kind: 'game' },
    ] as const
    for (const view of views) {
      saveWorkspace('game', null, view)
      expect(loadWorkspace('game')?.view).toEqual(view)
    }
  })

  it('drops unknown kinds and malformed shapes', () => {
    localStorage.setItem(
      'waica:workspace:game',
      JSON.stringify({ waicaWorkspace: 1, openScenePath: 7, view: { kind: 'wormhole' } }),
    )
    expect(loadWorkspace('game')).toEqual({ openScenePath: null, view: null })
    localStorage.setItem(
      'waica:workspace:game',
      JSON.stringify({ waicaWorkspace: 1, view: { kind: 'prefab', ref: 42 } }),
    )
    expect(loadWorkspace('game')).toEqual({ openScenePath: null, view: null })
  })

  it('rejects corrupted records and other versions', () => {
    localStorage.setItem('waica:workspace:game', 'not json {')
    expect(loadWorkspace('game')).toBeNull()
    localStorage.setItem('waica:workspace:game', JSON.stringify({ waicaWorkspace: 2 }))
    expect(loadWorkspace('game')).toBeNull()
  })
})
