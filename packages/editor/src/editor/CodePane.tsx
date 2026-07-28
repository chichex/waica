import { useEffect, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import type { SceneJson } from '@waica/engine'
import { SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import { WRITE_DELAY_MS } from './write-scheduler'

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
  onSceneSaved,
}: {
  fs?: ProjectFS
  /** Display path; also the file to load/save when no `source` is given. */
  path: string
  /** Inline source: skips fs loading and disables saving. */
  source?: string
  readOnly?: boolean
  onBack?(): void
  onSceneSaved?(scene: SceneJson): void
}) {
  const [value, setValue] = useState<string | null>(source ?? null)
  const [dirty, setDirty] = useState(false)
  const valueRef = useRef<string | null>(source ?? null)
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    dirtyRef.current = false
    if (source != null) {
      valueRef.current = source
      setValue(source)
      setDirty(false)
      return
    }
    if (!fs) return
    setValue(null)
    setDirty(false)
    void fs.readText(path).then((text) => {
      valueRef.current = text
      setValue(text)
    })
  }, [fs, path, source])

  const save = async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const current = valueRef.current
    if (readOnly || source != null || !fs || current == null) return
    await fs.writeText(path, current)
    // Typing during the write keeps the buffer dirty for the next round.
    if (valueRef.current === current) {
      dirtyRef.current = false
      setDirty(false)
    }
    if (path === SCENE_PATH) {
      try {
        onSceneSaved?.(JSON.parse(current) as SceneJson)
      } catch {
        // Invalid JSON: it stays saved on disk, the live scene is untouched.
      }
    }
  }

  // A dirty buffer lands when the pane unmounts (switching files, closing the
  // project) and when the tab hides or closes — editing is saving, like
  // everywhere else in the editor.
  useEffect(() => {
    if (readOnly || source != null || !fs) return
    const flush = (): void => {
      if (dirtyRef.current) void save()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
    // save() closes over these same props; refs carry the live buffer.
  }, [fs, path, source, readOnly])

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
          <button className="ed-mini" onClick={() => void save()}>
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
            timer.current = setTimeout(() => void save(), WRITE_DELAY_MS)
          }}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save())
          }}
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, readOnly }}
        />
      )}
    </div>
  )
}
