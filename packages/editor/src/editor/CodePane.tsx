import { useEffect, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import type { SceneJson } from '@waica/engine'
import { SCENE_PATH, type ProjectFS } from '../fs/project-fs'

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

  useEffect(() => {
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
    const current = valueRef.current
    if (readOnly || source != null || !fs || current == null) return
    await fs.writeText(path, current)
    setDirty(false)
    if (path === SCENE_PATH) {
      try {
        onSceneSaved?.(JSON.parse(current) as SceneJson)
      } catch {
        // Invalid JSON: it stays saved on disk, the live scene is untouched.
      }
    }
  }

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
          language={LANGUAGES[ext] ?? 'plaintext'}
          theme="vs-dark"
          value={value}
          onChange={(next) => {
            valueRef.current = next ?? ''
            setDirty(true)
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
