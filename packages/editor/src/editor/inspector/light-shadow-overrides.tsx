import { useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import {
  resolveLightShadow,
  shadowComponentIssues,
  SHADOW_MAP_SIZES,
  SHADOW_OVERRIDE_PARAMS,
  type ResolvedLightShadow,
  type SceneComponentJson,
  type ShadowOverrideName,
} from '@waica/engine'
import type { ComponentPropHandlers } from './ComponentCard'
import type { ParamDiagnostic } from '../collision-category-diagnostics'
import { NumberField } from '../NumberField'
import { ParamDiagnosticMessages } from '../StringListField'
import { LightShadowContext } from './light-shadow-context'
import { OverridableName, PropRow } from './PropRow'

const EFFECTIVE_KEYS = {
  shadowMapSize: 'mapSize', shadowMaxDistance: 'maxDistance', shadowBias: 'bias',
  shadowNormalBias: 'normalBias', shadowRadius: 'radius',
} as const satisfies Record<ShadowOverrideName, keyof ResolvedLightShadow>

export function isLightShadowOverride(type: string, key: string): key is ShadowOverrideName {
  return (type === 'Sun' || type === 'PointLight') && Object.hasOwn(SHADOW_OVERRIDE_PARAMS, key)
}

export function isLightShadowFlag(type: string, key: string): boolean {
  return (type === 'Sun' || type === 'PointLight') && key === 'castShadows'
}

function storedValue(value: unknown): string {
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value) ?? 'undefined'
}

/** Live capacity checks can reject an otherwise valid authored change. */
function useShadowEdit() {
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const run = (action: () => void, restoreInput = false): void => {
    try {
      action()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      if (restoreInput) setRevision((previous) => previous + 1)
    }
  }
  return { error, setError, revision, run }
}

/** The basic flag keeps the generic boolean row, with the light's capacity error boundary. */
export function LightShadowFlagRow(props: ComponentProps<typeof PropRow>) {
  const edit = useShadowEdit()
  const id = useId()
  const diagnostics: ParamDiagnostic[] = shadowComponentIssues('Sun', { castShadows: props.value })
    .map((issue) => ({ severity: 'error', message: issue.message }))
  const change = (value: unknown): void => {
    const next = value === 'true' ? true : value === 'false' ? false : value
    if (typeof next !== 'boolean') { edit.setError('Cast shadows must be true or false.'); return }
    edit.run(() => props.onChange(next))
  }
  return (
    <div className="ed-param-block">
      <PropRow {...props} diagnostics={diagnostics.length > 0 ? diagnostics : undefined}
        onChange={change}
        onReset={props.onReset && (() => edit.run(() => props.onReset?.()))}
        onApply={props.onApply && (() => edit.run(() => props.onApply?.()))} />
      <ParamDiagnosticMessages id={id} diagnostics={edit.error ? [{ severity: 'error', message: edit.error }] : []} />
    </div>
  )
}

interface ShadowInputProps {
  name: ShadowOverrideName
  value: unknown
  invalid: boolean
  diagnosticId: string
  restoreFocus: boolean
  onChange: (text: string) => void
}

/** Invalid JSON remains readable beside a safe numeric replacement field. */
function ShadowOverrideField({ name, value, invalid, diagnosticId, onChange }: ShadowInputProps) {
  const { label, min, max, step } = SHADOW_OVERRIDE_PARAMS[name]
  const aria = { 'aria-label': label, 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? diagnosticId : undefined }
  if (name === 'shadowMapSize') {
    const known = SHADOW_MAP_SIZES.some((size) => size === value)
    return (
      <label className="ed-row">
        <span>{label} value</span>
        <select {...aria} className={known ? undefined : 'is-missing'} value={known ? storedValue(value) : 'invalid'} onChange={(event) => onChange(event.target.value)}>
          {!known && <option value="invalid">{storedValue(value)} — invalid ⚠</option>}
          {SHADOW_MAP_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    )
  }
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <>
      {!numeric && <label className="ed-row"><span>Stored {label}</span><input type="text" readOnly value={storedValue(value)} aria-invalid="true" aria-describedby={diagnosticId} /></label>}
      <label className="ed-row">
        <span>{label} value</span>
        <NumberField {...aria} min={min} max={max} step={step} value={numeric ? value : ''} onChange={onChange} />
      </label>
    </>
  )
}

/** A rejected NumberField draft is remounted, retaining keyboard focus on that same field. */
function ShadowOverrideInput(props: ShadowInputProps) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!props.restoreFocus) return
    root.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input[type="number"], select')?.focus()
  }, [props.restoreFocus])
  return <div ref={root}><ShadowOverrideField {...props} /></div>
}

function useShadowOverrideEdit(name: ShadowOverrideName, onProp: ComponentPropHandlers['onProp']) {
  const edit = useShadowEdit()
  const changeNumber = (text: string): void => {
    if (text.trim() === '') return
    const next = Number(text)
    const issue = shadowComponentIssues('Sun', { [name]: next })[0]
    if (issue) { edit.setError(issue.message); return }
    edit.run(() => onProp(name, next), true)
  }
  return { ...edit, changeNumber }
}

function ShadowOverrideRow({
  name, value, effective, overridden, onProp, onReset, onApply,
}: ComponentPropHandlers & {
  name: ShadowOverrideName
  value: unknown
  effective: number
  overridden: boolean
}) {
  const { label } = SHADOW_OVERRIDE_PARAMS[name]
  const inherited = value === null || value === undefined
  const edit = useShadowOverrideEdit(name, onProp)
  const diagnosticId = useId()
  const diagnostics: ParamDiagnostic[] = shadowComponentIssues('Sun', { [name]: value })
    .map((issue) => ({ severity: 'error', message: issue.message }))
  if (edit.error) diagnostics.push({ severity: 'error', message: edit.error })
  return (
    <div className="ed-param-block" role="group" aria-label={label}>
      <div className="ed-row">
        <OverridableName label={label} overridden={overridden}
          onReset={onReset && (() => edit.run(() => onReset(name)))} onApply={onApply && (() => edit.run(() => onApply(name)))} />
      </div>
      <div className="ed-hint">
        {inherited ? 'Inherited from scene' : `Override · Stored: ${storedValue(value)}`} · Effective: {effective}
      </div>
      <PropRow label={`Override ${label}`} value={!inherited}
        onChange={(enabled) => edit.run(() => onProp(name, enabled ? effective : null))} />
      {!inherited && (
        <ShadowOverrideInput key={edit.revision} name={name} value={value} invalid={diagnostics.length > 0}
          diagnosticId={diagnosticId} restoreFocus={edit.revision > 0} onChange={edit.changeNumber} />
      )}
      <div className="ed-row">
        <button type="button" className="ed-mini" disabled={inherited}
          aria-label={`Inherit scene for ${label}`} onClick={() => edit.run(() => onProp(name, null))}>Inherit scene</button>
      </div>
      <ParamDiagnosticMessages id={diagnosticId} diagnostics={diagnostics} />
    </div>
  )
}

/** Nullable light overrides have their own semantics; other component params stay generic. */
export function LightShadowOverrides({ comp, names, overridden, ...handlers }: ComponentPropHandlers & {
  comp: SceneComponentJson
  names: ShadowOverrideName[]
  overridden?: Set<string>
}) {
  const context = useContext(LightShadowContext)
  const [open, setOpen] = useState(false)
  const id = useId()
  const effective = resolveLightShadow(comp.type === 'Sun' ? 'sun' : 'point', context.scene, comp.props ?? {})
  return (
    <div className="ed-param-block">
      <button type="button" className="ed-mini" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(!open)}>Advanced shadows</button>
      <div className="ed-hint" role="status">{context.label}: {context.scene.quality} · {effective.enabled ? 'Active' : 'Inactive'}</div>
      <div id={id} hidden={!open}>
        {names.map((name) => (
          <ShadowOverrideRow key={name} name={name} value={comp.props?.[name]}
            effective={effective[EFFECTIVE_KEYS[name]]} overridden={overridden?.has(name) ?? false} {...handlers} />
        ))}
      </div>
    </div>
  )
}
