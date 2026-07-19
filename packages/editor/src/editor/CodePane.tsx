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
  onBack,
  onSceneSaved,
}: {
  fs: ProjectFS
  path: string
  onBack(): void
  onSceneSaved(scene: SceneJson): void
}) {
  const [value, setValue] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const valueRef = useRef<string | null>(null)

  useEffect(() => {
    setValue(null)
    setDirty(false)
    void fs.readText(path).then((text) => {
      valueRef.current = text
      setValue(text)
    })
  }, [fs, path])

  const save = async (): Promise<void> => {
    const current = valueRef.current
    if (current == null) return
    await fs.writeText(path, current)
    setDirty(false)
    if (path === SCENE_PATH) {
      try {
        onSceneSaved(JSON.parse(current) as SceneJson)
      } catch {
        // JSON inválido: queda guardado en disco, la escena viva no se toca.
      }
    }
  }

  const ext = path.split('.').pop() ?? ''
  return (
    <div className="ed-code">
      <header className="ed-code-head">
        <button className="ed-mini" onClick={onBack}>
          ◀ viewport
        </button>
        <span className="ed-code-path">
          {path}
          {dirty ? ' •' : ''}
        </span>
        <button className="ed-mini" onClick={() => void save()}>
          guardar ⌘S
        </button>
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
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2 }}
        />
      )}
    </div>
  )
}
