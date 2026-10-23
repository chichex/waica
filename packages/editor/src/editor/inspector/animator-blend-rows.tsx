// The Animator's Blends section (issue 205 CA-19): one card per blend with its
// name, parameter, smoothing and points, each point a clip of the glb its
// Model draws (typed by hand while the editor cannot read it) and a
// threshold, and the card's preview slider (CA-21). Every edit writes the
// whole `blends` object once, its points in threshold order, so it is one
// commit; a threshold being typed is written in place, and the points go in
// threshold order once it is confirmed (Enter or leaving the field), so the
// row never moves under the keyboard. A stored clip the glb lacks stays as it
// is, marked missing.
import { DEFAULT_BLEND_SMOOTHING } from '@waica/engine'
import { useState, type ReactNode } from 'react'
import { MissingOption, missingOptionClass } from '../missing-option'
import { NumberField } from '../NumberField'
import { useInspectedAnimator } from './animator-clip-rows'
import {
  blendsOf,
  NEW_BLEND,
  nextBlendName,
  nextPoint,
  pointsOf,
  renamedBlend,
  sortedPoints,
  thresholdOf,
  withBlend,
  withoutBlend,
  withPoints,
  type StoredBlend,
  type StoredPoint,
} from './animator-blends-edit'
import { BlendPreviewSlider } from './blend-preview-slider'

interface BlendsRowProps {
  /** The section's name, with its override marks. */
  name: ReactNode
  value: unknown
  onChange: (value: unknown) => void
}

/** A number typed in a field, or undefined while the text is not one (empty included). */
function typedNumber(text: string): number | undefined {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) ? value : undefined
}

/** `Animator.blends`, the "Blends" section: a card per blend and the button that adds one. */
export function AnimatorBlendsRow({ name, value, onChange }: BlendsRowProps) {
  const { glbClips } = useInspectedAnimator()
  const blends = blendsOf(value)
  const names = Object.keys(blends)
  const taken = [...names, ...(glbClips ?? [])]
  return (
    <div className="ed-param-block ed-blends" role="group" aria-label="Blends">
      <div className="ed-row">
        {name}
        <button className="ed-mini" onClick={() => onChange(withBlend(blends, nextBlendName(taken), NEW_BLEND))}>
          Add blend
        </button>
      </div>
      {names.map((blendName) => (
        <BlendCard
          key={blendName}
          name={blendName}
          blend={blends[blendName] ?? {}}
          clips={glbClips}
          taken={taken}
          onChange={(blend) => onChange(withBlend(blends, blendName, blend))}
          onRename={(to) => onChange(renamedBlend(blends, blendName, to))}
          onRemove={() => onChange(withoutBlend(blends, blendName))}
        />
      ))}
    </div>
  )
}

interface BlendCardProps {
  name: string
  blend: StoredBlend
  /** The glb's clips the points may name; null while unknown. */
  clips: readonly string[] | null
  /** Names a rename may not take: the other blends' and the glb's clips. */
  taken: readonly string[]
  onChange: (blend: StoredBlend) => void
  onRename: (to: string) => void
  onRemove: () => void
}

/** One blend: its name, param, smoothing, points and preview. */
function BlendCard({ name, blend, clips, taken, onChange, onRename, onRemove }: BlendCardProps) {
  const points = pointsOf(blend)
  const param = typeof blend.param === 'string' ? blend.param : ''
  const setPoints = (next: readonly StoredPoint[]): void => onChange(withPoints(blend, next))
  const typePoints = (next: readonly StoredPoint[]): void => onChange({ ...blend, points: [...next] })
  // Once a typed threshold is confirmed, the points go in threshold order, if typing left them out of it.
  const confirmOrder = (): void => {
    const sorted = sortedPoints(points)
    if (sorted.some((point, index) => point !== points[index])) onChange({ ...blend, points: sorted })
  }
  const setSmoothing = (text: string): void => {
    const smoothing = typedNumber(text)
    if (smoothing !== undefined && smoothing >= 0) onChange({ ...blend, smoothing })
  }
  return (
    <div className="ed-blend" role="group" aria-label={`Blend ${name}`}>
      <div className="ed-blend-head">
        <span>{name}</span>
        <button className="ed-mini" aria-label={`Remove the ${name} blend`} title="Remove this blend" onClick={onRemove}>
          ✕
        </button>
      </div>
      <BlendNameField name={name} taken={taken} onRename={onRename} />
      <label className="ed-row">
        <span>param</span>
        <input type="text" value={param} onChange={(e) => onChange({ ...blend, param: e.target.value })} />
      </label>
      <label className="ed-row">
        <span>smoothing</span>
        <NumberField step={0.05} min={0} value={typeof blend.smoothing === 'number' ? blend.smoothing : DEFAULT_BLEND_SMOOTHING} onChange={setSmoothing} />
      </label>
      <BlendPoints name={name} points={points} clips={clips} edits={{ onChange: setPoints, onType: typePoints, onConfirm: confirmOrder }} />
      <BlendPreviewSlider blend={name} param={param} points={points} />
    </div>
  )
}

/** The blend's name, renamed on Enter or when the field loses focus; an empty or taken name goes back. */
function BlendNameField({ name, taken, onRename }: { name: string; taken: readonly string[]; onRename: (to: string) => void }) {
  const [draft, setDraft] = useState(name)
  const commit = (): void => {
    const next = draft.trim()
    if (next !== '' && next !== name && !taken.includes(next)) onRename(next)
    else setDraft(name)
  }
  return (
    <label className="ed-row">
      <span>name</span>
      <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  )
}

/** A stable key per point: its clip and how many points before it play that clip, so a point keeps its row as edits reorder them. */
function pointKey(points: readonly StoredPoint[], index: number): string {
  const clip = String(points[index]?.clip)
  return `${clip}:${points.slice(0, index).filter((point) => String(point.clip) === clip).length}`
}

/** How the points' edits are saved: a whole edit in threshold order, a threshold being typed in place, and its confirmation. */
interface PointEdits {
  onChange: (points: readonly StoredPoint[]) => void
  onType: (points: readonly StoredPoint[]) => void
  onConfirm: () => void
}

interface BlendPointsProps {
  name: string
  points: readonly StoredPoint[]
  clips: readonly string[] | null
  edits: PointEdits
}

/** The blend's points, in threshold order, and the button that adds one. */
function BlendPoints({ name, points, clips, edits }: BlendPointsProps) {
  const { onChange, onType, onConfirm } = edits
  const replaced = (index: number, next: StoredPoint): StoredPoint[] => points.map((each, at) => (at === index ? next : each))
  return (
    <div className="ed-blend-points" role="group" aria-label={`${name} points`}>
      {points.map((point, index) => (
        <BlendPointRow
          key={pointKey(points, index)}
          label={`point ${index + 1}`}
          point={point}
          clips={clips}
          onChange={(next) => onChange(replaced(index, next))}
          onTypeAt={(next) => onType(replaced(index, next))}
          onConfirmAt={onConfirm}
          onRemove={() => onChange(points.filter((_, at) => at !== index))}
        />
      ))}
      <button className="ed-mini" onClick={() => onChange([...points, nextPoint(points, clips)])}>
        Add point
      </button>
    </div>
  )
}

interface BlendPointProps {
  label: string
  point: StoredPoint
  clips: readonly string[] | null
  onChange: (point: StoredPoint) => void
  /** A keystroke in the threshold field: the point with what it holds so far. */
  onTypeAt: (point: StoredPoint) => void
  /** The threshold field confirmed: Enter, or leaving it. */
  onConfirmAt: () => void
  onRemove: () => void
}

/** One point: its clip, its threshold and its removal. */
function BlendPointRow({ label, point, clips, onChange, onTypeAt, onConfirmAt, onRemove }: BlendPointProps) {
  const clip = typeof point.clip === 'string' ? point.clip : ''
  const at = thresholdOf(point)
  const missing = clips !== null && !clips.includes(clip)
  const setAt = (text: string): void => {
    const next = typedNumber(text)
    if (next !== undefined) onTypeAt({ ...point, at: next })
  }
  return (
    <div className={`ed-blend-point ${missing ? 'is-missing' : ''}`} role="group" aria-label={label}>
      <BlendPointClip clip={clip} clips={clips} missing={missing} onChange={(next) => onChange({ ...point, clip: next })} />
      <label>
        at
        <NumberField step={0.5} value={Number.isFinite(at) ? at : ''} onChange={setAt} onBlur={onConfirmAt} onKeyDown={(e) => e.key === 'Enter' && onConfirmAt()} />
      </label>
      <button className="ed-mini" aria-label={`Remove ${label}`} title="Remove this point" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

/** A point's clip: a select over the glb's clips (a stored one it lacks marked missing), or free text while they are unknown. */
function BlendPointClip({ clip, clips, missing, onChange }: { clip: string; clips: readonly string[] | null; missing: boolean; onChange: (clip: string) => void }) {
  if (!clips) {
    return (
      <label>
        clip
        <input type="text" value={clip} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  return (
    <label>
      clip
      <select className={missingOptionClass(missing)} value={clip} onChange={(e) => onChange(e.target.value)}>
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
