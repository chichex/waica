import { useCallback, useEffect, useRef, useState } from 'react'
import type { SceneJson } from '@waica/engine'
import { WriteScheduler } from './write-scheduler'

export type SaveState = 'saved' | 'saving' | 'error'

/**
 * The editor's durable-write channel: one debounce clock for every file,
 * the toolbar's save indicator, and the committed scenes whose write has not
 * landed yet. Every function here is stable for the editor's lifetime.
 */
export interface Persistence {
  saveState: SaveState
  setSaveState: (state: SaveState) => void
  /** Debounces `write` under `key`; the indicator shows saving until it lands. */
  schedule: (key: string, write: () => Promise<void>) => void
  /** Drops a pending write without running it (deletes and renames). */
  cancel: (key: string) => void
  /** A committed scene still waiting for its write: newer than the file on disk. */
  pendingScene: (path: string) => SceneJson | undefined
  holdScene: (path: string, scene: SceneJson) => void
  /** Forgets the pending scene; with `scene`, only while it is still that one. */
  releaseScene: (path: string, scene?: SceneJson) => void
}

export function usePersistence(): Persistence {
  const [saveState, setSaveState] = useState<SaveState>('saved')
  /** Debounces every durable write; flushAll() runs when the page hides or the editor closes. */
  const writer = useRef(new WriteScheduler())
  // Committed scenes whose write hasn't landed yet: reopening one must show
  // this content, not the stale file on disk.
  const pendingScenes = useRef(new Map<string, SceneJson>())

  // Whatever is debounce-pending lands before the page hides or closes —
  // otherwise the last moments of edits would die with the tab.
  useEffect(() => {
    const flush = (): void => writer.current.flushAll()
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      // "← projects" unmounts the editor with writes possibly pending: land them.
      flush()
    }
  }, [])

  const schedule = useCallback((key: string, write: () => Promise<void>): void => {
    setSaveState('saving')
    writer.current.schedule(key, () => {
      write()
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    })
  }, [])
  const cancel = useCallback((key: string): void => writer.current.cancel(key), [])
  const pendingScene = useCallback((path: string) => pendingScenes.current.get(path), [])
  const holdScene = useCallback((path: string, scene: SceneJson): void => {
    pendingScenes.current.set(path, scene)
  }, [])
  const releaseScene = useCallback((path: string, scene?: SceneJson): void => {
    if (scene === undefined || pendingScenes.current.get(path) === scene) {
      pendingScenes.current.delete(path)
    }
  }, [])

  return { saveState, setSaveState, schedule, cancel, pendingScene, holdScene, releaseScene }
}
