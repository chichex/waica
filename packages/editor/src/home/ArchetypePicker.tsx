import { useEffect, useState } from 'react'
import { ARCHETYPE_CATALOG, type ArchetypeCard } from '../project/archetype'
import type { ProjectStart } from '../project/template'

// Folder name doubles as the npm package name.
const NAME_RE = /^[a-z0-9][a-z0-9-_.]*$/

const START_OPTIONS: { id: ProjectStart; icon: string; label: string; blurb: string }[] = [
  {
    id: 'demo',
    icon: '🎮',
    label: 'Demo level',
    blurb: 'A small playable level — platforms, coins and enemies to remix or delete.',
  },
  {
    id: 'blank',
    icon: '⬜',
    label: 'Blank',
    blurb: 'Just the chassis: movement, physics, camera and input. You place every entity.',
  },
]

export function ArchetypePicker({
  onPick,
  onClose,
}: {
  onPick(id: string, name: string, start: ProjectStart): void
  onClose(): void
}) {
  const [dim, setDim] = useState<'2d' | '3d'>('2d')
  const [chosen, setChosen] = useState<ArchetypeCard | null>(null)
  const [name, setName] = useState('my-game')
  const [start, setStart] = useState<ProjectStart>('demo')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = NAME_RE.test(name)
  const submit = (): void => {
    if (chosen && valid) onPick(chosen.id, name, start)
  }

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <strong>
            {chosen ? `New project — ${chosen.icon} ${chosen.label}` : 'New project — pick an archetype'}
          </strong>
          <button className="ed-mini" title="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        {chosen ? (
          <div className="picker-name">
            <label>
              What's your game called?
              <input
                autoFocus
                type="text"
                value={name}
                placeholder="my-game"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
            </label>
            {!valid && (
              <p className="picker-name-err">
                use lowercase letters, numbers and dashes (it becomes the folder and package name)
              </p>
            )}
            <div className="picker-start">
              {START_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`picker-start-card ${start === option.id ? 'is-on' : ''}`}
                  onClick={() => setStart(option.id)}
                >
                  <span className="picker-card-icon">{option.icon}</span>
                  <strong>{option.label}</strong>
                  <span>{option.blurb}</span>
                </button>
              ))}
            </div>
            <p className="picker-name-hint">
              Next you pick where to save it: Waica creates the{' '}
              <code>{valid ? name : '…'}/</code> folder in there
              {start === 'demo' ? ', with the project ready to play' : ''}.
            </p>
            <div className="picker-actions">
              <button className="ed-mini" onClick={() => setChosen(null)}>
                ← archetype
              </button>
              <button className="picker-create" disabled={!valid} onClick={submit}>
                Pick a folder and create
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="picker-dims">
              {(['2d', '3d'] as const).map((d) => (
                <button
                  key={d}
                  className={`picker-dim ${dim === d ? 'is-on' : ''}`}
                  onClick={() => setDim(d)}
                >
                  {d.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="picker-grid">
              {ARCHETYPE_CATALOG[dim].map((card) => (
                <button
                  key={card.id}
                  className="picker-card"
                  disabled={card.status !== 'ready'}
                  onClick={() => setChosen(card)}
                >
                  <span className="picker-card-icon">{card.icon}</span>
                  <strong>
                    {card.label}
                    {card.status === 'soon' && <em className="picker-chip">coming soon 🚧</em>}
                  </strong>
                  <span>{card.blurb}</span>
                </button>
              ))}
            </div>

            <p className="picker-foot">
              The archetype sets up movement, physics, camera, animations and input. The ones
              marked 🚧 are on the way.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
