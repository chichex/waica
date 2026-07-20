import { useEffect, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { GameUi, Stats } from '@waica/engine'
import type { ProjectStats } from '../project/stats'

/**
 * The UI piece editor: Monaco with the piece's HTML on the left, a live
 * preview on the right. The preview mounts with the SAME runtime the game
 * uses (GameUi: shadow root + {{stat}} bindings), fed the project's
 * declared initial stat values — what you see is what play mode shows.
 */
export function UiPane({
  name,
  html,
  stats,
  onChange,
}: {
  name: string
  /** The piece's saved source (edits flow up through onChange). */
  html: string
  /** Initial stat values (src/stats.json) that fill the {{bindings}}. */
  stats: ProjectStats
  onChange(html: string): void
}) {
  const [value, setValue] = useState(html)
  const [preview, setPreview] = useState(html)
  const stage = useRef<HTMLDivElement>(null)

  // Re-render the preview shortly after the user stops typing.
  useEffect(() => {
    if (preview === value) return
    const timer = setTimeout(() => setPreview(value), 250)
    return () => clearTimeout(timer)
  }, [value, preview])

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const ui = new GameUi(new Stats(stats), () => host)
    ui.define(name, preview)
    ui.show(name)
    return () => ui.dispose()
  }, [name, preview, stats])

  return (
    <div className="ed-ui-pane">
      <div className="ed-ui-code">
        <header className="ed-code-head">
          <span className="ed-code-path">
            src / ui / <b>{name}.html</b>
          </span>
        </header>
        <MonacoEditor
          height="100%"
          language="html"
          theme="vs-dark"
          value={value}
          onChange={(next) => {
            const text = next ?? ''
            setValue(text)
            onChange(text)
          }}
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2 }}
        />
      </div>
      <div className="ed-ui-preview">
        <div ref={stage} className="ed-ui-stage" />
        <div className="ed-stage-caption">
          preview · {'{{stats}}'} show their initial values from src/stats.json
        </div>
      </div>
    </div>
  )
}
