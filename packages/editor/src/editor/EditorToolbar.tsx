import { reportRejection } from '../report-rejection'
import type { EditorCore } from './editor-commits'
import { sceneLabel } from './icons'
import { play, stop } from './play-session'
import type { SaveState } from './use-persistence'

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'saved ✓',
  saving: 'saving…',
  error: 'error ✗',
}

/** The top bar: project name, the scene to play, Play/Stop, save status and the way out. */
export function EditorToolbar({ core, onClose }: { core: EditorCore; onClose: () => void }) {
  const { fs } = core
  const { scene } = core.scenes
  const { mode } = core.view
  const { saveState } = core.persistence
  return (
    <header className="ed-toolbar">
      <span className="ed-brand">🐕 waica</span>
      <span className="ed-project">
        {fs.name}
        {fs.kind === 'memory' && <em className="ed-demo-chip">in-memory demo</em>}
      </span>
      <span className="ed-spacer" />
      <ScenePicker core={core} />
      <button
        className={`ed-play ${mode === 'play' ? 'is-on' : ''}`}
        disabled={!scene}
        onClick={(e) => {
          // Drop focus so Space (jump) doesn't re-trigger the button.
          e.currentTarget.blur()
          if (mode === 'edit') reportRejection(play(core), 'play')
          else stop(core)
        }}
      >
        {mode === 'edit' ? '▶ Play' : '⏹ Stop'}
      </button>
      <span className={`ed-save is-${saveState}`}>{SAVE_LABELS[saveState]}</span>
      <button className="ed-mini" onClick={onClose}>
        ← projects
      </button>
    </header>
  )
}

/** The scene to open and play; locked while a run is in progress. */
function ScenePicker({ core }: { core: EditorCore }) {
  const { openScenePath } = core.scenes
  const [scenePaths] = core.library.scenePaths
  return (
    <select
      className="ed-scene-select"
      title="Scene to play"
      value={openScenePath ?? ''}
      disabled={core.view.mode === 'play' || scenePaths.length === 0}
      onChange={(e) => core.view.openView({ kind: 'scene', path: e.target.value })}
    >
      {!openScenePath && (
        <option value="" disabled>
          scene…
        </option>
      )}
      {scenePaths.map((path) => (
        <option key={path} value={path}>
          {sceneLabel(path)}
        </option>
      ))}
    </select>
  )
}
