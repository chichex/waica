// A blend card's preview slider (issue 205 CA-21): moving it plays the blend
// at that value on the live Animator of the inspected entity, in edit mode,
// one step per frame. Its value is transient: it never reaches the scene file
// or the history, and starts at 0 again whenever the preview's session ends
// (another entity, Play, a rebuilt stage), another card's preview takes the
// stage, or the card unmounts.
import { useContext, useEffect, useEffectEvent, useState } from 'react'
import { NumberField } from '../NumberField'
import type { BlendPreviewRefusal } from '../viewport-blend-preview'
import { thresholdRange, type StoredPoint } from './animator-blends-edit'
import { BlendPreviewContext, type BlendPreview } from './blend-preview'

interface PreviewSliderProps {
  blend: string
  param: string
  points: readonly StoredPoint[]
}

/** The slider over the blend's thresholds, reset with every preview session. */
export function BlendPreviewSlider({ blend, param, points }: PreviewSliderProps) {
  const preview = useContext(BlendPreviewContext)
  return <PreviewControl key={preview?.session ?? 'none'} preview={preview} blend={blend} param={param} range={thresholdRange(points)} />
}

interface PreviewControlProps {
  preview: BlendPreview | null
  blend: string
  param: string
  range: { min: number; max: number } | null
}

/** What the stage answered the last move: the hint it shows, and whether the slider stays on to ask again. */
const REFUSALS: Readonly<Record<BlendPreviewRefusal, { hint: string; retry: boolean }>> = {
  play: { hint: 'Preview runs in edit mode.', retry: false },
  // The model may load any moment: the next move asks again.
  'not-loaded': { hint: 'No live Animator to preview on: its model has not loaded.', retry: true },
  'not-built': { hint: 'The stage was built before this blend or its param: press Play and Stop to rebuild it, then preview.', retry: false },
}

/** Why the slider cannot preview (null when it can), and whether it is off for now. */
function previewHint(preview: BlendPreview | null, range: PreviewControlProps['range'], refusal: BlendPreviewRefusal | null): { reason: string | null; disabled: boolean } {
  if (!preview) return { reason: 'No live view to preview in.', disabled: true }
  if (preview.unavailable) return { reason: preview.unavailable, disabled: true }
  if (refusal) return { reason: REFUSALS[refusal].hint, disabled: !REFUSALS[refusal].retry }
  return range ? { reason: null, disabled: false } : { reason: 'Add points at two different thresholds to preview.', disabled: true }
}

const clampTo = (value: number, { min, max }: { min: number; max: number }): number => Math.min(max, Math.max(min, value))

function PreviewControl({ preview, blend, param, range }: PreviewControlProps) {
  const rest = range ? clampTo(0, range) : 0
  const [value, setValue] = useState(rest)
  const [refusal, setRefusal] = useState<BlendPreviewRefusal | null>(null)
  // The stage runs one preview: this slider shows its value only while its blend's is the one running.
  const live = preview?.active === blend
  // Ending the session (unmount, a new key) ends this blend's preview, if it still runs.
  const stop = useEffectEvent(() => {
    if (preview?.active === blend) preview.stop(blend)
  })
  useEffect(() => () => stop(), [])
  const { reason, disabled } = previewHint(preview, range, refusal)
  const move = (next: number): void => {
    if (!preview || !range) return
    const clamped = clampTo(next, range)
    setValue(clamped)
    setRefusal(preview.start(blend, param, clamped))
  }
  return (
    <>
      <SliderRow label={`Preview ${param}`} range={range} value={live ? value : rest} disabled={disabled} onMove={move} />
      {reason && <div className="ed-hint">{reason}</div>}
    </>
  )
}

interface SliderRowProps {
  label: string
  range: PreviewControlProps['range']
  value: number
  disabled: boolean
  onMove: (value: number) => void
}

/** The slider and its number field, over the thresholds' range in a hundred steps. */
function SliderRow({ label, range, value, disabled, onMove }: SliderRowProps) {
  const step = range ? (range.max - range.min) / 100 : 0.01
  return (
    <label className="ed-row ed-row-slider">
      <span>preview</span>
      <input type="range" aria-label={label} min={range?.min ?? 0} max={range?.max ?? 1} step={step} value={value} disabled={disabled} onChange={(e) => onMove(Number(e.target.value))} />
      <NumberField
        aria-label={`${label} value`}
        step={step}
        value={Math.round(value * 100) / 100}
        disabled={disabled}
        onChange={(text) => {
          const typed = Number(text)
          if (text.trim() !== '' && Number.isFinite(typed)) onMove(typed)
        }}
      />
    </label>
  )
}
