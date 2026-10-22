// A blend card's preview slider (issue 205 CA-21): moving it plays the blend
// at that value on the live Animator of the inspected entity, in edit mode,
// one step per frame. Its value is transient: it never reaches the scene file
// or the history, and starts at 0 again whenever the preview's session ends
// (another entity, Play, a rebuilt stage) or the card unmounts.
import { useContext, useEffect, useEffectEvent, useRef, useState } from 'react'
import { NumberField } from '../NumberField'
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

/** Why the slider cannot preview, or null when it can. */
function unavailableReason(preview: BlendPreview | null, range: PreviewControlProps['range'], failed: boolean): string | null {
  if (!preview) return 'No live view to preview in.'
  if (preview.unavailable) return preview.unavailable
  if (failed) return 'No live Animator to preview on: its model has not loaded.'
  return range ? null : 'Add points at two different thresholds to preview.'
}

const clampTo = (value: number, { min, max }: { min: number; max: number }): number => Math.min(max, Math.max(min, value))

function PreviewControl({ preview, blend, param, range }: PreviewControlProps) {
  const [value, setValue] = useState(() => (range ? clampTo(0, range) : 0))
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  // Ending the session (unmount, a new key) ends the preview this slider started.
  const stop = useEffectEvent(() => {
    if (started.current) preview?.stop()
  })
  useEffect(() => () => stop(), [])
  const reason = unavailableReason(preview, range, failed)
  const move = (next: number): void => {
    if (!preview || !range) return
    const clamped = clampTo(next, range)
    setValue(clamped)
    started.current = preview.start(blend, param, clamped)
    if (!started.current) setFailed(true)
  }
  return (
    <>
      <SliderRow label={`Preview ${param}`} range={range} value={value} disabled={reason !== null} onMove={move} />
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
