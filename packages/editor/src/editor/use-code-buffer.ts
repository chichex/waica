import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { SceneJson } from '@waica/engine'
import { SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import { reportRejection } from '../report-rejection'
import { parseSceneJson } from '../scene/scene-file'
import { WRITE_DELAY_MS } from './write-scheduler'

export interface CodeBufferOptions {
  fs?: ProjectFS
  /** The file to load and save when no inline `source` is given. */
  path: string
  /** Inline source: skips fs loading and disables saving. */
  source?: string
  readOnly: boolean
  onSaved?: (path: string) => void | Promise<void>
  onSceneSaved?: (scene: SceneJson) => void
}

/** One file's text as the code pane edits it: loaded once, auto-saved, flushed on leave. */
export interface CodeBuffer {
  /** null until the file is read. */
  value: string | null
  dirty: boolean
  /** An edit from the editor: marks the buffer dirty and restarts the auto-save clock. */
  edit: (next: string) => void
  /** Lands the buffer now (⌘S, the save button). */
  save: () => Promise<void>
}

export function useCodeBuffer(options: CodeBufferOptions): CodeBuffer {
  const { fs, path, source } = options
  const [value, setValue] = useState<string | null>(source ?? null)
  const [dirty, setDirty] = useState(false)
  const valueRef = useRef<string | null>(source ?? null)
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One instance edits one file: the Editor keys each pane by its path, so a
  // different file is a fresh pane with fresh state. This effect only reads.
  useEffect(() => {
    if (source != null || !fs) return
    // A read this effect's cleanup already discarded (StrictMode's first
    // mount, or an unmount) must not land.
    let current = true
    fs.readText(path).then(
      (text) => {
        if (!current) return
        valueRef.current = text
        setValue(text)
      },
      (error: unknown) => {
        if (current) console.error(error)
      },
    )
    return () => {
      current = false
    }
  }, [fs, path, source])

  const save = async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const current = valueRef.current
    if (options.readOnly || source != null || !fs || current == null) return
    await fs.writeText(path, current)
    await options.onSaved?.(path)
    // Typing during the write keeps the buffer dirty for the next round.
    if (valueRef.current === current) {
      dirtyRef.current = false
      setDirty(false)
    }
    if (path === SCENE_PATH) handSceneUp(current, options.onSceneSaved)
  }

  useFlushOnLeave(() => {
    if (dirtyRef.current) reportRejection(save(), 'save')
  })

  const edit = (next: string): void => {
    valueRef.current = next
    dirtyRef.current = true
    setDirty(true)
    // Auto-save on the same clock as the rest of the editor; ⌘S lands it now.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => reportRejection(save(), 'save'), WRITE_DELAY_MS)
  }

  return { value, dirty, edit, save }
}

function handSceneUp(text: string, onSceneSaved: ((scene: SceneJson) => void) | undefined): void {
  try {
    onSceneSaved?.(parseSceneJson(text))
  } catch {
    // Invalid JSON or not a scene: it stays saved on disk, the live scene is untouched.
  }
}

/**
 * A dirty buffer lands when the pane unmounts (switching files, closing the
 * project) and when the tab hides or closes — editing is saving, like
 * everywhere else in the editor. save() skips read-only and inline panes.
 */
function useFlushOnLeave(flush: () => void): void {
  const flushDirty = useEffectEvent((): void => flush())
  useEffect(() => {
    const onLeave = (): void => flushDirty()
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      flushDirty()
    }
  }, [])
}
