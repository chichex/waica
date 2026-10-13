// The Animator's clip rows (issue #173 CA-5, CA-6, CA-8): its initial clip and
// its per-clip overrides, offered from the clips of the glb its Model draws
// when the editor can read them, typed by hand when it cannot. A stored name
// the glb lacks stays as it is, marked missing, and is never rewritten.
import { useContext, useState, type ReactNode } from 'react'
import { useGlbClips } from '../glb-clips'
import { MissingOption, missingOptionClass } from '../missing-option'
import { NumberField } from '../NumberField'
import { modelSrcOf } from './component-meta'
import { RefTargetsContext } from './ref-targets-context'

/** An override as stored: `loop` and `speed` (AnimatorClipOverride), plus whatever else the JSON holds. */
type StoredOverride = Record<string, unknown>
type ClipOverrides = Record<string, StoredOverride>

/** The clips of the glb the inspected entity or prefab draws; null while unknown. */
function useInspectedModelClips(): readonly string[] | null {
  const { entity } = useContext(RefTargetsContext)
  return useGlbClips(modelSrcOf(entity?.components ?? []))
}

interface ClipRowProps {
  /** The row's name, with its override marks. */
  name: ReactNode
  value: unknown
  onChange: (value: unknown) => void
}

/** `Animator.initialClip`: a select over the glb's clips, "(none)" first, or free text while they are unknown. */
export function AnimatorInitialClipRow({ name, value, onChange }: ClipRowProps) {
  const clips = useInspectedModelClips()
  const clip = typeof value === 'string' ? value : ''
  if (!clips) {
    return (
      <label className="ed-row">
        {name}
        <input type="text" value={clip} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  const missing = clip !== '' && !clips.includes(clip)
  return (
    <label className="ed-row">
      {name}
      <select className={missingOptionClass(missing)} value={clip} onChange={(e) => onChange(e.target.value)}>
        <option value="">(none)</option>
        {missing && <MissingOption value={clip} />}
        {clips.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The overrides an Animator's `clips` holds, dropping anything that is not one. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The overrides an Animator's `clips` holds, each kept whole (an edit rewrites only the field it changes). */
function overridesOf(value: unknown): ClipOverrides {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])))
}

interface ClipOverrideProps {
  name: string
  override: StoredOverride
  /** The glb is readable and has no clip of this name. */
  missing: boolean
  onChange: (override: StoredOverride) => void
  onRemove: () => void
}

/** One override: its loop checkbox, its speed and its removal. */
function ClipOverrideRow({ name, override, missing, onChange, onRemove }: ClipOverrideProps) {
  const label = missing ? `${name} — missing ⚠` : name
  const setSpeed = (text: string): void => {
    const speed = Number(text)
    if (text.trim() !== '' && Number.isFinite(speed)) onChange({ ...override, speed })
  }
  return (
    <div className={`ed-clip-override ${missing ? 'is-missing' : ''}`} role="group" aria-label={label}>
      <span className="ed-clip-override-name">{label}</span>
      <label>
        loop
        <input type="checkbox" checked={override.loop !== false} onChange={(e) => onChange({ ...override, loop: e.target.checked })} />
      </label>
      <label>
        speed
        <NumberField step={0.1} value={typeof override.speed === 'number' ? override.speed : 1} onChange={setSpeed} />
      </label>
      <button className="ed-mini" aria-label={`Remove the ${name} override`} title="Remove this override" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

/** Adds an override: a select over the clips not overridden yet, or a typed name while the clips are unknown. */
function AddClipOverride({ clips, taken, onAdd }: { clips: readonly string[] | null; taken: readonly string[]; onAdd: (name: string) => void }) {
  const [draft, setDraft] = useState('')
  if (!clips) {
    return (
      <input
        type="text"
        aria-label="Add override"
        placeholder="clip name, then Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const name = draft.trim()
          if (e.key !== 'Enter' || name === '' || taken.includes(name)) return
          onAdd(name)
          setDraft('')
        }}
      />
    )
  }
  return (
    <select aria-label="Add override" value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
      <option value="">add override…</option>
      {clips
        .filter((clip) => !taken.includes(clip))
        .map((clip) => (
          <option key={clip} value={clip}>
            {clip}
          </option>
        ))}
    </select>
  )
}

/**
 * `Animator.clips`, the "Clip overrides" row: each overridden clip with its
 * loop and speed, a remove button, and the control that adds one. Every
 * change writes the whole `clips` object once, so it is one commit.
 */
export function AnimatorClipOverridesRow({ value, onChange }: Omit<ClipRowProps, 'name'>) {
  const clips = useInspectedModelClips()
  const overrides = overridesOf(value)
  const names = Object.keys(overrides)
  const without = (name: string): ClipOverrides => Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== name))
  return (
    <div className="ed-param-block ed-clip-overrides" role="group" aria-label="Clip overrides">
      <div className="ed-row">
        <span>Clip overrides</span>
        <AddClipOverride clips={clips} taken={names} onAdd={(name) => onChange({ ...overrides, [name]: {} })} />
      </div>
      {names.map((name) => (
        <ClipOverrideRow
          key={name}
          name={name}
          override={overrides[name] ?? {}}
          missing={clips !== null && !clips.includes(name)}
          onChange={(override) => onChange({ ...overrides, [name]: override })}
          onRemove={() => onChange(without(name))}
        />
      ))}
    </div>
  )
}
