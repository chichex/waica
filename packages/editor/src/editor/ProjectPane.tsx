import { useEffect, useState } from 'react'
import type { StatValue } from '@waica/engine'
import { useArchetype } from '../project/archetype'
import {
  actionLabel,
  deriveActionLabel,
  keyLabel,
  parseControls,
  type ProjectControls,
} from '../project/controls'
import type { GameSettings } from '../project/game'
import type { ProjectStats } from '../project/stats'
import { NumberField } from './NumberField'

/** Centered card hosting a project-wide editor (controls / stats / game) in the stage. */
export function ProjectPane({
  savePath,
  children,
}: {
  savePath: string
  children: React.ReactNode
}) {
  return (
    <div className="ed-project-pane">
      <div className="ed-project-card">
        {children}
        <div className="ed-hint ed-project-save">saved to {savePath}</div>
      </div>
    </div>
  )
}

/**
 * Which action is waiting for its next key press, and the window listener
 * that records that key (Escape cancels) while one is.
 */
function useKeyCapture(
  controls: ProjectControls,
  onChange: (next: ProjectControls) => void,
): [string | null, (action: string | null) => void] {
  const { bindings, labels } = controls
  const [capturing, setCapturing] = useState<string | null>(null)
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      // Capture phase so the pressed key never leaks into the editor UI.
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape') {
        const codes = bindings[capturing] ?? []
        if (!codes.includes(e.code)) {
          onChange({ bindings: { ...bindings, [capturing]: [...codes, e.code] }, labels })
        }
      }
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, bindings, labels, onChange])
  return [capturing, setCapturing]
}

interface ActionRowProps {
  action: string
  controls: ProjectControls
  /** This action is the one waiting for its next key press. */
  listening: boolean
  onChange: (next: ProjectControls) => void
  onToggleCapture: () => void
}

/** One action: its keys as removable chips, the key-capture button and, for project actions, removal. */
function ActionRow({ action, controls, listening, onChange, onToggleCapture }: ActionRowProps) {
  const archetype = useArchetype()
  const codes = controls.bindings[action] ?? []
  return (
    <div className="ed-keys-row">
      <span className="ed-keys-action">
        {actionLabel(action, controls.labels, archetype.actionLabels)}
      </span>
      <div className="ed-keys">
        {codes.map((code) => (
          <button
            key={code}
            className="ed-key-chip"
            title="Remove this key"
            onClick={() => onChange(withoutKey(controls, action, code))}
          >
            {keyLabel(code)} <span className="ed-key-x">×</span>
          </button>
        ))}
        <button className={`ed-key-add ${listening ? 'is-listening' : ''}`} onClick={onToggleCapture}>
          {listening ? 'press a key… (Esc cancels)' : '+ key'}
        </button>
        {!(action in archetype.bindings) && (
          <button
            className="ed-mini"
            title="Remove this action"
            onClick={() => onChange(withoutAction(controls, action))}
          >
            ✕
          </button>
        )}
      </div>
      {codes.length === 0 && <div className="ed-hint ed-warn">no keys — this action can't fire</div>}
    </div>
  )
}

/** Names a new action; refuses a name already bound. */
function NewActionRow({
  bindings,
  onAdd,
}: {
  bindings: ProjectControls['bindings']
  onAdd: (action: string) => void
}) {
  const [newAction, setNewAction] = useState('')
  const addName = newAction.trim()
  const addTaken = addName !== '' && addName in bindings
  const addAction = (): void => {
    if (!addName || addTaken) return
    onAdd(addName)
    setNewAction('')
  }
  return (
    <>
      <div className="ed-stat-add">
        <input
          type="text"
          placeholder="new action name…"
          value={newAction}
          onChange={(e) => setNewAction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addAction()
          }}
        />
        <button className="ed-mini" disabled={!addName || addTaken} onClick={addAction}>
          add
        </button>
      </div>
      {addTaken && <div className="ed-hint ed-warn">an action named “{addName}” already exists</div>}
    </>
  )
}

/** The controls without one key on one action. */
function withoutKey(controls: ProjectControls, action: string, code: string): ProjectControls {
  const { bindings, labels } = controls
  return {
    bindings: { ...bindings, [action]: (bindings[action] ?? []).filter((c) => c !== code) },
    labels,
  }
}

/** The controls without an action — and without its label. */
function withoutAction(controls: ProjectControls, action: string): ProjectControls {
  const nextBindings = { ...controls.bindings }
  delete nextBindings[action]
  // The label goes with the action it named: leaving it behind would write
  // a label for something the project no longer has.
  const nextLabels = { ...controls.labels }
  delete nextLabels[action]
  return { bindings: nextBindings, labels: nextLabels }
}

/** The controls with a new, still keyless action and its derived label. */
function withNewAction(controls: ProjectControls, name: string): ProjectControls {
  return {
    bindings: { ...controls.bindings, [name]: [] },
    labels: { ...controls.labels, [name]: deriveActionLabel(name) },
  }
}

interface ControlsEditorProps {
  controls: ProjectControls
  onChange: (next: ProjectControls) => void
}

export function ControlsEditor({ controls, onChange }: ControlsEditorProps) {
  const archetype = useArchetype()
  const { bindings } = controls
  const [capturing, setCapturing] = useKeyCapture(controls, onChange)

  const addAction = (name: string): void => {
    onChange(withNewAction(controls, name))
    setCapturing(name)
  }

  return (
    <>
      <div className="ed-section">
        <header className="ed-sec-head">Keyboard</header>
        {Object.keys(bindings).map((action) => (
          <ActionRow
            key={action}
            action={action}
            controls={controls}
            listening={capturing === action}
            onChange={onChange}
            onToggleCapture={() => setCapturing(capturing === action ? null : action)}
          />
        ))}
        <NewActionRow bindings={bindings} onAdd={addAction} />
        <div className="ed-hint">
          state machines fire on actions with “key press” transitions (input:{'<'}action{'>'})
        </div>
      </div>
      <button
        className="ed-wide"
        onClick={() =>
          onChange({ bindings: parseControls(null, archetype.bindings), labels: {} })
        }
      >
        ↺ Reset to defaults
      </button>
    </>
  )
}

/** Kinds a new stat can be born as; the row editor then follows the value's type. */
const NEW_STAT_VALUES: Record<string, StatValue> = { number: 0, toggle: false, text: '' }

function StatValueInput({
  value,
  onChange,
}: {
  value: StatValue
  onChange: (value: StatValue) => void
}) {
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
  }
  if (typeof value === 'number') {
    return <NumberField step={1} value={value} onChange={(t) => onChange(Number(t))} />
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
}

/** Names a new stat and picks its kind; refuses a name already taken. */
function NewStatRow({ stats, onAdd }: { stats: ProjectStats; onAdd: (name: string, value: StatValue) => void }) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('number')
  const name = newName.trim()
  const taken = name in stats
  const addStat = (): void => {
    if (!name || taken) return
    onAdd(name, NEW_STAT_VALUES[newKind] ?? 0)
    setNewName('')
  }
  return (
    <>
      <div className="ed-stat-add">
        <input
          type="text"
          placeholder="new stat name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addStat()
          }}
        />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
          <option value="number">number</option>
          <option value="toggle">on/off</option>
          <option value="text">text</option>
        </select>
        <button className="ed-mini" disabled={!name || taken} onClick={addStat}>
          add
        </button>
      </div>
      {taken && <div className="ed-hint ed-warn">a stat named “{name}” already exists</div>}
    </>
  )
}

interface StatsEditorProps {
  stats: ProjectStats
  onChange: (next: ProjectStats) => void
}

export function StatsEditor({ stats, onChange }: StatsEditorProps) {
  const removeStat = (statName: string): void => {
    const next = { ...stats }
    delete next[statName]
    onChange(next)
  }

  const entries = Object.entries(stats)
  return (
    <>
      <div className="ed-hint">
        every play run starts from these values — behaviours read and change them
      </div>
      <div className="ed-section">
        <header className="ed-sec-head">Stats</header>
        {entries.length === 0 && <div className="ed-hint">no stats yet — try points or lives</div>}
        {entries.map(([statName, value]) => (
          <div className="ed-row ed-stat-row" key={statName}>
            <span>{statName}</span>
            <StatValueInput
              value={value}
              onChange={(next) => onChange({ ...stats, [statName]: next })}
            />
            <button
              className="ed-mini"
              title="Remove this stat"
              onClick={() => removeStat(statName)}
            >
              ✕
            </button>
          </div>
        ))}
        <NewStatRow stats={stats} onAdd={(name, value) => onChange({ ...stats, [name]: value })} />
      </div>
    </>
  )
}

type Resolution = GameSettings['resolution']

/** A fixed resolution's width and height, each at least one pixel. */
function FixedSizeRows({
  res,
  setRes,
}: {
  res: Resolution
  setRes: (patch: Partial<Resolution>) => void
}) {
  return (
    <>
      <label className="ed-row">
        <span>width</span>
        <NumberField
          step={1}
          min={1}
          value={res.width}
          onChange={(t) => setRes({ width: Math.max(1, Number(t)) })}
        />
      </label>
      <label className="ed-row">
        <span>height</span>
        <NumberField
          step={1}
          min={1}
          value={res.height}
          onChange={(t) => setRes({ height: Math.max(1, Number(t)) })}
        />
      </label>
      <div className="ed-hint">
        the game always shows a {res.width}×{res.height} view, with bars when the window
        has a different shape
      </div>
    </>
  )
}

interface GameSettingsEditorProps {
  settings: GameSettings
  onChange: (next: GameSettings) => void
}

/** How many image pixels one world unit covers. */
function ArtScaleRows({ settings, onChange }: GameSettingsEditorProps) {
  return (
    <>
      <header className="ed-sec-head">Art scale</header>
      <label className="ed-row">
        <span>pixels per unit</span>
        <NumberField
          step={1}
          min={1}
          value={settings.pixelsPerUnit}
          onChange={(t) => onChange({ ...settings, pixelsPerUnit: Math.max(1, Number(t)) })}
        />
      </label>
      <div className="ed-hint">
        how many image pixels one world unit covers — "use image size" and the camera's pixel
        readout use this to map your art to world sizes
      </div>
    </>
  )
}

export function GameSettingsEditor({ settings, onChange }: GameSettingsEditorProps) {
  const res = settings.resolution
  const setRes = (patch: Partial<Resolution>): void =>
    onChange({ ...settings, resolution: { ...res, ...patch } })
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Resolution</header>
      <label className="ed-row">
        <span>mode</span>
        <select
          value={res.mode}
          onChange={(e) => setRes({ mode: e.target.value as 'fill' | 'fixed' })}
        >
          <option value="fill">fill the window</option>
          <option value="fixed">fixed (letterbox)</option>
        </select>
      </label>
      {res.mode === 'fixed' ? (
        <FixedSizeRows res={res} setRes={setRes} />
      ) : (
        <div className="ed-hint">the view stretches to whatever window the game runs in</div>
      )}
      <ArtScaleRows settings={settings} onChange={onChange} />
    </div>
  )
}
