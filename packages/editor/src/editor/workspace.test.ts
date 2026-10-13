import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCameraPose, loadWorkspace, saveCameraPose, saveWorkspace } from './workspace'

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
      { kind: 'componentFile', path: 'src/components/gun.ts' },
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

describe('the editor camera pose per scene (issue #173 CA-12)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const POSE = { position: [3, 4, 5] as [number, number, number], target: [0, 1, 0] as [number, number, number] }

  it('keeps a pose per scene path inside the workspace entry, beside the open scene and view', () => {
    saveWorkspace('game', 'src/scenes/main.scene.json', { kind: 'scene', path: 'src/scenes/main.scene.json' })
    saveCameraPose('game', 'src/scenes/main.scene.json', POSE)
    saveCameraPose('game', 'src/scenes/cave.scene.json', { position: [9, 9, 9], target: [1, 1, 1] })

    expect(loadCameraPose('game', 'src/scenes/main.scene.json')).toEqual(POSE)
    expect(loadCameraPose('game', 'src/scenes/cave.scene.json')).toEqual({ position: [9, 9, 9], target: [1, 1, 1] })
    expect(loadCameraPose('game', 'src/scenes/none.scene.json')).toBeNull()
    expect(loadCameraPose('other-game', 'src/scenes/main.scene.json')).toBeNull()
    expect(loadWorkspace('game')).toEqual({ openScenePath: 'src/scenes/main.scene.json', view: { kind: 'scene', path: 'src/scenes/main.scene.json' } })
    expect(Object.keys(JSON.parse(localStorage.getItem('waica:workspace:game') ?? '{}') as object)).toContain('cameras')
  })

  it('keeps the poses when the open scene and view are saved again', () => {
    saveCameraPose('game', 'src/scenes/main.scene.json', POSE)
    saveWorkspace('game', 'src/scenes/main.scene.json', { kind: 'controls' })

    expect(loadCameraPose('game', 'src/scenes/main.scene.json')).toEqual(POSE)
  })

})

describe('a remembered pose that cannot be read (issue #173 CA-12)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const POSE = { position: [3, 4, 5] as [number, number, number], target: [0, 1, 0] as [number, number, number] }

  it('drops a malformed pose', () => {
    localStorage.setItem(
      'waica:workspace:game',
      JSON.stringify({ waicaWorkspace: 1, openScenePath: null, view: null, cameras: { a: { position: [1, 2], target: [0, 0, 0] }, b: { position: [1, 2, 'x'], target: [0, 0, 0] }, c: 7 } }),
    )
    expect(loadCameraPose('game', 'a')).toBeNull()
    expect(loadCameraPose('game', 'b')).toBeNull()
    expect(loadCameraPose('game', 'c')).toBeNull()
  })

  it('saves nothing and loads nothing when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    try {
      expect(() => saveCameraPose('game', 'src/scenes/main.scene.json', POSE)).not.toThrow()
      expect(loadCameraPose('game', 'src/scenes/main.scene.json')).toBeNull()
    } finally {
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      })
    }
  })
})
