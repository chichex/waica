import { NumberField } from '../NumberField'

export type Vec3 = [number, number, number]

/** A labelled row of X/Y/Z number fields: a 3D position, rotation, scale or camera point. */
export function Vec3Row({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: Vec3
  step: number
  onChange: (next: Vec3) => void
}) {
  const edit = (axis: 0 | 1 | 2, text: string): void => {
    const next: Vec3 = [value[0], value[1], value[2]]
    next[axis] = Number(text)
    onChange(next)
  }
  return (
    <div className="ed-row ed-row-xyz">
      <span>{label}</span>
      <NumberField step={step} value={value[0]} onChange={(text) => edit(0, text)} />
      <NumberField step={step} value={value[1]} onChange={(text) => edit(1, text)} />
      <NumberField step={step} value={value[2]} onChange={(text) => edit(2, text)} />
    </div>
  )
}
