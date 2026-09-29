import MonacoEditor from '@monaco-editor/react'
import type { SceneJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import { reportRejection } from '../report-rejection'
import { useCodeBuffer } from './use-code-buffer'

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
  const buffer = useCodeBuffer({ fs, path, source, readOnly, onSaved, onSceneSaved })
  const { value } = buffer
  const save = (): void => reportRejection(buffer.save(), 'save')

  const ext = path.split('.').pop() ?? ''
  return (
    <div className="ed-code">
      <CodePaneHeader path={path} dirty={buffer.dirty} onBack={onBack} onSave={readOnly ? undefined : save} />
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
          onChange={(next) => buffer.edit(next ?? '')}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save)
          }}
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, readOnly }}
        />
      )}
    </div>
  )
}

/** The pane's header: the way back, the file's folder and name (• while dirty), and save. */
function CodePaneHeader({
  path,
  dirty,
  onBack,
  onSave,
}: {
  path: string
  dirty: boolean
  onBack?: () => void
  /** Absent for read-only panes. */
  onSave?: () => void
}) {
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash)
  const file = path.slice(slash + 1)
  return (
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
      {onSave && (
        <button className="ed-mini" onClick={onSave}>
          save ⌘S
        </button>
      )}
    </header>
  )
}
