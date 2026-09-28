import { useEffect, useEffectEvent, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import type { SceneJson } from '@waica/engine'
import { SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import { WRITE_DELAY_MS } from './write-scheduler'
import { reportRejection } from '../report-rejection'
import { parseSceneJson } from '../scene/scene-file'

const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  json: 'json',
  html: 'html',
  css: 'css',
  md: 'markdown',
}

export function CodePane({
  fs,
  path,
  source,
  readOnly = false,
  onBack,
  onSaved,
  onSceneSaved,
}: {
  fs?: ProjectFS
  /**
   * Display path; also the file to load/save when no `source` is given. A
   * pane stays on its first file: render a new one (key it by path) per file.
   */
  path: string
  /** Inline source: skips fs loading and disables saving. */
  source?: string
  readOnly?: boolean
  onBack?(): void
  onSaved?(path: string): void | Promise<void>
  onSceneSaved?(scene: SceneJson): void
}) {
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
    if (readOnly || source != null || !fs || current == null) return
    await fs.writeText(path, current)
    await onSaved?.(path)
    // Typing during the write keeps the buffer dirty for the next round.
    if (valueRef.current === current) {
      dirtyRef.current = false
      setDirty(false)
    }
    if (path === SCENE_PATH) {
      try {
        onSceneSaved?.(parseSceneJson(current))
      } catch {
        // Invalid JSON or not a scene: it stays saved on disk, the live scene is untouched.
      }
    }
  }

  // A dirty buffer lands when the pane unmounts (switching files, closing the
  // project) and when the tab hides or closes — editing is saving, like
  // everywhere else in the editor. save() skips read-only and inline panes.
  const flushDirty = useEffectEvent((): void => {
    if (dirtyRef.current) reportRejection(save(), 'save')
  })
  useEffect(() => {
    const flush = (): void => flushDirty()
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flushDirty()
    }
  }, [])

  const ext = path.split('.').pop() ?? ''
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash)
  const file = path.slice(slash + 1)
  return (
    <div className="ed-code">
      <header className="ed-code-head">
        {onBack && (
          <button className="ed-mini" onClick={onBack}>
            ◀ viewport
          </button>
        )}
        <span className="ed-code-path">
          {dir && `${dir} / `}
          <b>{file}</b>
          {dirty ? ' •' : ''}
        </span>
        {!readOnly && (
          <button className="ed-mini" onClick={() => reportRejection(save(), 'save')}>
            save ⌘S
          </button>
        )}
      </header>
      {value == null ? (
        <div className="ed-hint ed-pad">…</div>
      ) : (
        <MonacoEditor
          height="100%"
          // file:/// so imports resolve against the virtual node_modules (monaco-types.ts).
          path={`file:///${path}`}
          language={LANGUAGES[ext] ?? 'plaintext'}
          theme="vs-dark"
          value={value}
          onChange={(next) => {
            valueRef.current = next ?? ''
            dirtyRef.current = true
            setDirty(true)
            // Auto-save on the same clock as the rest of the editor; ⌘S lands it now.
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => reportRejection(save(), 'save'), WRITE_DELAY_MS)
          }}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => reportRejection(save(), 'save'))
          }}
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, readOnly }}
        />
      )}
    </div>
  )
}
