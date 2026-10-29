// The Animator's clip rows (issue #173 CA-5, CA-6, CA-8): its initial clip and
// its per-clip overrides, offered from the clips of the glb its Model draws
// and the Animator's own blends when the editor can read them, typed by hand
// when it cannot. A stored name the glb lacks stays as it is, marked missing,
// and is never rewritten. An override's fade (issue 205 CA-18) is empty when
// it inherits the Animator's.
import { useContext, useState, type ReactNode } from 'react'
import type { SceneComponentJson } from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { useGlbClips } from '../glb-clips'
import { MissingOption, missingOptionClass } from '../missing-option'
import { NumberField } from '../NumberField'
import { componentDefaults, modelSrcOf, playableClips } from './component-meta'
import { RefTargetsContext } from './ref-targets-context'

/** An override as stored: `loop`, `speed` and `fade` (AnimatorClipOverride), plus whatever else the JSON holds. */
type StoredOverride = Record<string, unknown>
type ClipOverrides = Record<string, StoredOverride>

/** What the inspected entity's or prefab's Animator plays, as its rows offer it. */
export interface InspectedAnimator {
  /** The clips of the glb its Model draws; null while unknown. */
  glbClips: readonly string[] | null
  /** The names `play` accepts: the glb's clips, then the Animator's blends; null while the glb's are unknown. */
  playable: readonly string[] | null
  /** The fade a clip without its own inherits: the Animator's `fade`, else its default. */
  fade: number
  /** The resolved components of the inspected entity or prefab. */
  components: readonly SceneComponentJson[]
}

/** The inspected entity's or prefab's Animator: its glb clips, its blends and its fade. */
export function useInspectedAnimator(): InspectedAnimator {
  const archetype = useArchetype()
  const components = useContext(RefTargetsContext).entity?.components ?? []
  const glbClips = useGlbClips(modelSrcOf(components))
  const animator = components.find((component) => component.type === 'Animator')
  const own = animator?.props?.fade
  const fallback = animator ? componentDefaults(animator, archetype).fade : undefined
  const fade = typeof own === 'number' ? own : typeof fallback === 'number' ? fallback : 0
  return { glbClips, playable: glbClips && playableClips(glbClips, components), fade, components }
}

interface ClipRowProps {
  /** The row's name, with its override marks. */
  name: ReactNode
  value: unknown
  onChange: (value: unknown) => void
}

/** `Animator.initialClip`: a select over the glb's clips and the blends, "(none)" first, or free text while they are unknown. */
export function AnimatorInitialClipRow({ name, value, onChange }: ClipRowProps) {
  const clips = useInspectedAnimator().playable
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
  /** The glb is readable and has no clip or blend of this name. */
  missing: boolean
  /** The fade an empty `fade` inherits. */
  inheritedFade: number
  onChange: (override: StoredOverride) => void
  onRemove: () => void
}

/** The override without its `fade`: it inherits the Animator's again. */
function withoutFade(override: StoredOverride): StoredOverride {
  return Object.fromEntries(Object.entries(override).filter(([key]) => key !== 'fade'))
}

/** One override: its loop checkbox, its speed, its fade (empty inherits) and its removal. */
function ClipOverrideRow({ name, override, missing, inheritedFade, onChange, onRemove }: ClipOverrideProps) {
  const label = missing ? `${name} — missing ⚠` : name
  const setSpeed = (text: string): void => {
    const speed = Number(text)
    if (text.trim() !== '' && Number.isFinite(speed)) onChange({ ...override, speed })
  }
  const setFade = (text: string): void => {
    const fade = Number(text)
    if (text.trim() === '') onChange(withoutFade(override))
    else if (Number.isFinite(fade) && fade >= 0) onChange({ ...override, fade })
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
      <label>
        fade
        <NumberField
          step={0.05}
          min={0}
          value={typeof override.fade === 'number' ? override.fade : ''}
          placeholder={String(inheritedFade)}
          title={`Empty: inherits the Animator fade, ${inheritedFade} s`}
          onChange={setFade}
        />
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
 * `Animator.clips`, the "Clip overrides" row: each overridden clip (or blend)
 * with its loop, speed and fade, a remove button, and the control that adds one. Every
 * change writes the whole `clips` object once, so it is one commit.
 */
export function AnimatorClipOverridesRow({ name: rowName, value, onChange }: ClipRowProps) {
  const { playable: clips, fade } = useInspectedAnimator()
  const overrides = overridesOf(value)
  const names = Object.keys(overrides)
  const without = (name: string): ClipOverrides => Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== name))
  return (
    <div className="ed-param-block ed-clip-overrides" role="group" aria-label="Clip overrides">
      <div className="ed-row">
        {rowName}
        <AddClipOverride clips={clips} taken={names} onAdd={(name) => onChange({ ...overrides, [name]: {} })} />
      </div>
      {names.map((name) => (
        <ClipOverrideRow
          key={name}
          name={name}
          override={overrides[name] ?? {}}
          missing={clips !== null && !clips.includes(name)}
          inheritedFade={fade}
          onChange={(override) => onChange({ ...overrides, [name]: override })}
          onRemove={() => onChange(without(name))}
        />
      ))}
    </div>
  )
}
