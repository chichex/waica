import { useEffect, useState, type ReactNode } from 'react'
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
  // Every choice survives going back a step: the tab, the name and the start.
  const [dim, setDim] = useState<'2d' | '3d'>('2d')
  const [chosen, setChosen] = useState<ArchetypeCard | null>(null)
  const [name, setName] = useState('my-game')
  const [start, setStart] = useState<ProjectStart>('demo')
  useEscape(onClose)

  return (
    <PickerDialog
      title={chosen ? `New project — ${chosen.icon} ${chosen.label}` : 'New project — pick an archetype'}
      onClose={onClose}
    >
      {chosen ? (
        <NameStep
          project={{ name, start }}
          onName={setName}
          onStart={setStart}
          onBack={() => setChosen(null)}
          onSubmit={() => {
            if (NAME_RE.test(name)) onPick(chosen.id, name, start)
          }}
        />
      ) : (
        <ArchetypeStep dim={dim} onDim={setDim} onChoose={setChosen} />
      )}
    </PickerDialog>
  )
}

function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** The modal frame: its title, the ✕ button, and a backdrop that closes it when clicked. */
function PickerDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    // Clicking outside is a pointer shortcut; the ✕ button closes it too.
    <div
      className="picker-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="picker" role="dialog" aria-modal="true" aria-label="New project">
        <header className="picker-head">
          <strong>{title}</strong>
          <button className="ed-mini" title="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Step one: the 2D/3D tabs and the archetype cards; the ones marked 🚧 can't be picked yet. */
function ArchetypeStep({
  dim,
  onDim,
  onChoose,
}: {
  dim: '2d' | '3d'
  onDim: (dim: '2d' | '3d') => void
  onChoose: (card: ArchetypeCard) => void
}) {
  return (
    <>
      <div className="picker-dims">
        {(['2d', '3d'] as const).map((d) => (
          <DimTab key={d} dim={d} on={dim === d} onDim={onDim} />
        ))}
      </div>

      <div className="picker-grid">
        {ARCHETYPE_CATALOG[dim].map((card) => (
          <button
            key={card.id}
            className="picker-card"
            disabled={card.status !== 'ready'}
            onClick={() => onChoose(card)}
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
  )
}

function DimTab({ dim, on, onDim }: { dim: '2d' | '3d'; on: boolean; onDim: (dim: '2d' | '3d') => void }) {
  return (
    <button className={`picker-dim ${on ? 'is-on' : ''}`} onClick={() => onDim(dim)}>
      {dim.toUpperCase()}
    </button>
  )
}

/** Step two: the game's name (it becomes the folder and package name) and how it starts. */
function NameStep({
  project,
  onName,
  onStart,
  onBack,
  onSubmit,
}: {
  project: { name: string; start: ProjectStart }
  onName: (name: string) => void
  onStart: (start: ProjectStart) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const { name, start } = project
  const valid = NAME_RE.test(name)
  return (
    <div className="picker-name">
      <NameField name={name} valid={valid} onName={onName} onSubmit={onSubmit} />
      <StartOptions start={start} onStart={onStart} />
      <p className="picker-name-hint">
        Next you pick where to save it: Waica creates the{' '}
        <code>{valid ? name : '…'}/</code> folder in there
        {start === 'demo' ? ', with the project ready to play' : ''}.
      </p>
      <div className="picker-actions">
        <button className="ed-mini" onClick={onBack}>
          ← archetype
        </button>
        <button className="picker-create" disabled={!valid} onClick={onSubmit}>
          Pick a folder and create
        </button>
      </div>
    </div>
  )
}

function NameField({
  name,
  valid,
  onName,
  onSubmit,
}: {
  name: string
  valid: boolean
  onName: (name: string) => void
  onSubmit: () => void
}) {
  return (
    <>
      <label>
        What's your game called?
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the name step was just opened by picking an archetype; focus moves into its only field
          autoFocus
          type="text"
          value={name}
          placeholder="my-game"
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
        />
      </label>
      {!valid && (
        <p className="picker-name-err">
          use lowercase letters, numbers and dashes (it becomes the folder and package name)
        </p>
      )}
    </>
  )
}

function StartOptions({ start, onStart }: { start: ProjectStart; onStart: (start: ProjectStart) => void }) {
  return (
    <div className="picker-start">
      {START_OPTIONS.map((option) => (
        <button
          key={option.id}
          className={`picker-start-card ${start === option.id ? 'is-on' : ''}`}
          onClick={() => onStart(option.id)}
        >
          <span className="picker-card-icon">{option.icon}</span>
          <strong>{option.label}</strong>
          <span>{option.blurb}</span>
        </button>
      ))}
    </div>
  )
}
