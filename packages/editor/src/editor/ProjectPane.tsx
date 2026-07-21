import { useEffect, useState } from 'react'
import { DEFAULT_BINDINGS, type InputBindings, type StatValue } from '@waica/engine'
import { ACTION_LABELS, keyLabel, parseControls } from '../project/controls'
import type { GameSettings } from '../project/game'
import type { ProjectStats } from '../project/stats'

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

export function ControlsEditor({
  bindings,
  onChange,
}: {
  bindings: InputBindings
  onChange(next: InputBindings): void
}) {
  /** Action waiting for its next key press, if any. */
  const [capturing, setCapturing] = useState<string | null>(null)
  const [newAction, setNewAction] = useState('')

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      // Capture phase so the pressed key never leaks into the editor UI.
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape') {
        const codes = bindings[capturing] ?? []
        if (!codes.includes(e.code)) {
          onChange({ ...bindings, [capturing]: [...codes, e.code] })
        }
      }
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, bindings, onChange])

  const removeKey = (action: string, code: string): void => {
    onChange({ ...bindings, [action]: (bindings[action] ?? []).filter((c) => c !== code) })
  }

  const removeAction = (action: string): void => {
    const next = { ...bindings }
    delete next[action]
    onChange(next)
  }

  const addName = newAction.trim()
  const addTaken = addName !== '' && addName in bindings
  const addAction = (): void => {
    if (!addName || addTaken) return
    onChange({ ...bindings, [addName]: [] })
    setNewAction('')
    setCapturing(addName)
  }

  return (
    <>
      <div className="ed-section">
        <header className="ed-sec-head">Keyboard</header>
        {Object.entries(bindings).map(([action, codes]) => (
          <div className="ed-keys-row" key={action}>
            <span className="ed-keys-action">{ACTION_LABELS[action] ?? action}</span>
            <div className="ed-keys">
              {codes.map((code) => (
                <button
                  key={code}
                  className="ed-key-chip"
                  title="Remove this key"
                  onClick={() => removeKey(action, code)}
                >
                  {keyLabel(code)} <span className="ed-key-x">×</span>
                </button>
              ))}
              <button
                className={`ed-key-add ${capturing === action ? 'is-listening' : ''}`}
                onClick={() => setCapturing(capturing === action ? null : action)}
              >
                {capturing === action ? 'press a key… (Esc cancels)' : '+ key'}
              </button>
              {!(action in DEFAULT_BINDINGS) && (
                <button
                  className="ed-mini"
                  title="Remove this action"
                  onClick={() => removeAction(action)}
                >
                  ✕
                </button>
              )}
            </div>
            {codes.length === 0 && (
              <div className="ed-hint ed-warn">no keys — this action can't fire</div>
            )}
          </div>
        ))}
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
        <div className="ed-hint">
          state machines fire on actions with “key press” transitions (input:{'<'}action{'>'})
        </div>
      </div>
      <button className="ed-wide" onClick={() => onChange(parseControls(null))}>
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
  onChange(value: StatValue): void
}) {
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
  }
  if (typeof value === 'number') {
    return (
      <input
        type="number"
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    )
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
}

export function StatsEditor({
  stats,
  onChange,
}: {
  stats: ProjectStats
  onChange(next: ProjectStats): void
}) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('number')

  const name = newName.trim()
  const taken = name in stats
  const addStat = (): void => {
    if (!name || taken) return
    onChange({ ...stats, [name]: NEW_STAT_VALUES[newKind] ?? 0 })
    setNewName('')
  }
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
      </div>
    </>
  )
}

export function GameSettingsEditor({
  settings,
  onChange,
}: {
  settings: GameSettings
  onChange(next: GameSettings): void
}) {
  const res = settings.resolution
  const setRes = (patch: Partial<GameSettings['resolution']>): void =>
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
        <>
          <label className="ed-row">
            <span>width</span>
            <input
              type="number"
              step={1}
              min={1}
              value={res.width}
              onChange={(e) => setRes({ width: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="ed-row">
            <span>height</span>
            <input
              type="number"
              step={1}
              min={1}
              value={res.height}
              onChange={(e) => setRes({ height: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <div className="ed-hint">
            the game always shows a {res.width}×{res.height} view, with bars when the window
            has a different shape
          </div>
        </>
      ) : (
        <div className="ed-hint">the view stretches to whatever window the game runs in</div>
      )}
    </div>
  )
}
