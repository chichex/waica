import { useEffect, useState } from 'react'
import { ARCHETYPE_CATALOG, type ArchetypeCard } from '../project/archetype'

// Same rule as create-waica: folder name and npm package name.
const NAME_RE = /^[a-z0-9][a-z0-9-_.]*$/

export function ArchetypePicker({
  onPick,
  onClose,
}: {
  onPick(id: string, name: string): void
  onClose(): void
}) {
  const [dim, setDim] = useState<'2d' | '3d'>('2d')
  const [chosen, setChosen] = useState<ArchetypeCard | null>(null)
  const [name, setName] = useState('my-game')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = NAME_RE.test(name)
  const submit = (): void => {
    if (chosen && valid) onPick(chosen.id, name)
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
            <p className="picker-name-hint">
              Next you pick where to save it: Waica creates the{' '}
              <code>{valid ? name : '…'}/</code> folder in there, with the project ready to play.
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
