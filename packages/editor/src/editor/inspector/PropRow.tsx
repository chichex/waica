import { useContext, useId, useState } from 'react'
import type { ParamSpec } from '@waica/engine'
import type { ParamDiagnostic } from '../collision-category-diagnostics'
import { NumberField } from '../NumberField'
import { availableRefTargets, type RefTarget } from '../ref-targets'
import { ParamDiagnosticMessages, StringListField } from '../StringListField'
import { RefRow } from './RefRow'
import { RefTargetsContext } from './ref-targets-context'
import { TexturePicker, TexturePreview } from './TextureControls'
import { useTextureDrop } from './use-texture-drop'

/**
 * A row's name plus, while the prop is overridden on this instance, the
 * override dot and the buttons that reset it or apply it to the prefab.
 */
export function OverridableName({
  label,
  overridden,
  onReset,
  onApply,
}: {
  label: React.ReactNode
  overridden: boolean
  onReset?: () => void
  onApply?: () => void
}) {
  // Rows are <label>s: stop clicks on these buttons from activating the input.
  const press = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }
  return (
    <span>
      {label}
      {overridden && <i className="ed-dot" title="overridden on this instance" />}
      {overridden && onReset && (
        <button className="ed-reset" title="Reset to the prefab's value" onClick={press(onReset)}>
          ↺
        </button>
      )}
      {overridden && onApply && (
        <button
          className="ed-reset ed-apply"
          title="Apply to the prefab — every instance gets this value"
          onClick={press(onApply)}
        >
          ⤒
        </button>
      )}
    </span>
  )
}

export function RoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ed-row">
      <span>{label}</span>
      <span className="ed-ro">{value}</span>
    </div>
  )
}

interface ValueRowProps<T> {
  name: React.ReactNode
  value: T
  onChange: (value: unknown) => void
}

/** A param with value-specific authoring diagnostics: free text plus its messages. */
function DiagnosedTextRow({
  param,
  name,
  value,
  diagnostics,
  onChange,
}: ValueRowProps<unknown> & { param: string; diagnostics: readonly ParamDiagnostic[] }) {
  const diagnosticId = `${useId().replaceAll(':', '')}-${param}-diagnostics`
  const invalid = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  return (
    <div className="ed-param-block" data-param={param}>
      <label className="ed-row">
        {name}
        <input
          type="text"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={diagnostics.length > 0 ? diagnosticId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <ParamDiagnosticMessages diagnostics={diagnostics} id={diagnosticId} />
    </div>
  )
}

/** A number param: a color picker for `color`, a slider when ranged, else a plain field. */
function NumberRow({
  label,
  name,
  value,
  spec,
  onChange,
}: ValueRowProps<number> & { label: string; spec?: ParamSpec }) {
  if (spec?.kind === 'color' || label === 'color') {
    const normalized = Math.max(0, Math.min(0xffffff, Math.round(value)))
    const hex = `#${normalized.toString(16).padStart(6, '0')}`
    return (
      <label className="ed-row">
        {name}
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(parseInt(e.target.value.slice(1), 16))}
        />
      </label>
    )
  }
  if (spec?.min !== undefined && spec?.max !== undefined) {
    return (
      <label className="ed-row ed-row-slider">
        {name}
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <NumberField step={spec.step ?? 0.1} value={value} onChange={(t) => onChange(Number(t))} />
      </label>
    )
  }
  return (
    <label className="ed-row">
      {name}
      <NumberField step={0.1} value={value} onChange={(t) => onChange(Number(t))} />
    </label>
  )
}

/** A string param: a select over declared options, a typed-reference picker, else free text. */
function StringRow({
  name,
  value,
  spec,
  referenceTargets,
  onChange,
}: ValueRowProps<string> & { spec?: ParamSpec; referenceTargets?: RefTarget[] }) {
  if (spec?.options) {
    return (
      <label className="ed-row">
        {name}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (referenceTargets) {
    return (
      <RefRow
        name={name}
        value={value}
        refKind={spec?.ref}
        targets={referenceTargets}
        onChange={onChange}
      />
    )
  }
  return (
    <label className="ed-row">
      {name}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Vector2Row({
  label,
  name,
  value,
  onChange,
}: ValueRowProps<unknown> & { label: string }) {
  const pair = Array.isArray(value) ? value : []
  const x = typeof pair[0] === 'number' && Number.isFinite(pair[0]) ? pair[0] : 0
  const y = typeof pair[1] === 'number' && Number.isFinite(pair[1]) ? pair[1] : 0
  return (
    <div className="ed-row ed-row-xy">
      {name}
      <NumberField
        aria-label={`${label} x`}
        step={0.1}
        value={x}
        onChange={(text) => onChange([Number(text), y])}
      />
      <NumberField
        aria-label={`${label} y`}
        step={0.1}
        value={y}
        onChange={(text) => onChange([x, Number(text)])}
      />
    </div>
  )
}

function TextureRow({ name, value, onChange }: ValueRowProps<unknown>) {
  const [choosing, setChoosing] = useState(false)
  const { texture } = useContext(RefTargetsContext)
  const art = texture.art.filter((item) => item.kind === 'image')
  const uri = typeof value === 'string' ? value : ''
  const choose = (next: string): void => {
    onChange(next)
    setChoosing(false)
  }
  const { dropping, dragProps } = useTextureDrop(art, choose, texture.onImport)
  return (
    <div className="ed-row">
      {name}
      <div>
        {choosing ? (
          <>
            <TexturePicker
              art={art}
              hasTexture={uri !== ''}
              dropping={dropping}
              dragProps={dragProps}
              onPick={choose}
              onKeep={() => setChoosing(false)}
              onImport={texture.onImport}
            />
            <button className="ed-mini" type="button" onClick={() => choose('')}>
              Clear image
            </button>
          </>
        ) : uri ? (
          <TexturePreview
            texture={uri}
            art={art}
            urlFor={texture.urlFor}
            overridden={false}
            dropping={dropping}
            dragProps={dragProps}
            onChange={() => setChoosing(true)}
          />
        ) : (
          <button
            className={`ed-mini ${dropping ? 'is-dropping' : ''}`}
            type="button"
            onClick={() => setChoosing(true)}
            {...dragProps}
          >
            Choose image…
          </button>
        )}
      </div>
    </div>
  )
}

/** Dispatches a plain param to the control its value's type calls for. */
function ValueRow({
  label,
  name,
  value,
  spec,
  referenceTargets,
  onChange,
}: ValueRowProps<unknown> & { label: string; spec?: ParamSpec; referenceTargets?: RefTarget[] }) {
  if (spec?.kind === 'vector2') {
    return <Vector2Row label={spec.label ?? label} name={name} value={value} onChange={onChange} />
  }
  if (spec?.kind === 'texture') {
    return <TextureRow name={name} value={value} onChange={onChange} />
  }
  if (typeof value === 'boolean') {
    return (
      <label className="ed-row">
        {name}
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }
  if (typeof value === 'number') {
    return <NumberRow label={label} name={name} value={value} spec={spec} onChange={onChange} />
  }
  if (typeof value === 'string') {
    return (
      <StringRow
        name={name}
        value={value}
        spec={spec}
        referenceTargets={referenceTargets}
        onChange={onChange}
      />
    )
  }
  return (
    <div className="ed-row">
      {name}
      <code className="ed-obj">{'{…}'}</code>
    </div>
  )
}

interface PropRowProps {
  /** The raw prop key; shown as-is unless the spec declares a friendly label. */
  label: string
  value: unknown
  /** Inspector metadata declared by the component class (label, range). */
  spec?: ParamSpec
  /** Instance override on top of the prefab value: marked with a dot. */
  overridden?: boolean
  onChange: (value: unknown) => void
  /** Clears the override (shown only while overridden). */
  onReset?: () => void
  /** Pushes the override into the prefab (shown only while overridden). */
  onApply?: () => void
  /** Present for params with value-specific authoring diagnostics. */
  diagnostics?: readonly ParamDiagnostic[]
}

export function PropRow({
  label,
  value,
  spec,
  overridden = false,
  onChange,
  onReset,
  onApply,
  diagnostics,
}: PropRowProps) {
  const referenceContext = useContext(RefTargetsContext)
  const referenceTargets =
    spec?.ref && spec.options === undefined
      ? availableRefTargets(referenceContext.project, spec.ref, referenceContext.entity)
      : undefined
  const name = (
    <OverridableName
      label={spec?.label ?? label}
      overridden={overridden}
      onReset={onReset}
      onApply={onApply}
    />
  )
  if (spec?.kind === 'string-list') {
    return (
      <StringListField
        param={label}
        name={name}
        value={value}
        diagnostics={diagnostics}
        onChange={onChange}
      />
    )
  }
  if (diagnostics !== undefined) {
    return (
      <DiagnosedTextRow
        param={label}
        name={name}
        value={value}
        diagnostics={diagnostics}
        onChange={onChange}
      />
    )
  }
  return (
    <ValueRow
      label={label}
      name={name}
      value={value}
      spec={spec}
      referenceTargets={referenceTargets}
      onChange={onChange}
    />
  )
}
