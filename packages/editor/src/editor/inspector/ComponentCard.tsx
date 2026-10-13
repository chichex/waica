import type { ParamSpec, SceneComponentJson } from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { collisionParamDiagnostics } from '../collision-category-diagnostics'
import { AnimatorClipOverridesRow, AnimatorInitialClipRow } from './animator-clip-rows'
import { componentDefaults, componentKeys, componentLabel } from './component-meta'
import { OverridableName, PropRow } from './PropRow'
import { ComponentUpdateSchedule } from './update-schedule'

/** Callbacks a component's prop rows fire, keyed by prop name. */
export interface ComponentPropHandlers {
  onProp: (key: string, value: unknown) => void
  onReset?: (key: string) => void
  onApply?: (key: string) => void
}

/** One prop's row: the Animator's clip rows (issue #173 CA-5, CA-6), else the generic PropRow. */
function ComponentRow({
  comp,
  propKey,
  value,
  spec,
  overridden,
  onProp,
  onReset,
  onApply,
}: ComponentPropHandlers & {
  comp: SceneComponentJson
  propKey: string
  value: unknown
  spec: ParamSpec | undefined
  overridden: boolean
}) {
  const reset = onReset && (() => onReset(propKey))
  const apply = onApply && (() => onApply(propKey))
  const change = (next: unknown): void => onProp(propKey, next)
  if (comp.type === 'Animator' && propKey === 'clips') return <AnimatorClipOverridesRow value={value} onChange={change} />
  if (comp.type === 'Animator' && propKey === 'initialClip') {
    const name = <OverridableName label={spec?.label ?? propKey} overridden={overridden} onReset={reset} onApply={apply} />
    return <AnimatorInitialClipRow name={name} value={value} onChange={change} />
  }
  return (
    <PropRow
      label={propKey}
      spec={spec}
      value={value}
      diagnostics={collisionParamDiagnostics(comp.type, propKey, value)}
      overridden={overridden}
      onChange={change}
      onReset={reset}
      onApply={apply}
    />
  )
}

export function ComponentRows({
  id,
  comp,
  keys,
  overridden,
  ...handlers
}: ComponentPropHandlers & {
  /** Key prefix so React inputs reset when the owner changes. */
  id: string
  comp: SceneComponentJson
  keys: string[]
  overridden?: Set<string>
}) {
  const archetype = useArchetype()
  const defaults = componentDefaults(comp, archetype)
  const specs: Record<string, ParamSpec | undefined> = archetype.registry.components[comp.type]?.params ?? {}
  return (
    <>
      {keys.map((key) => (
        <ComponentRow
          key={`${id}.${comp.type}.${key}`}
          comp={comp}
          propKey={key}
          value={comp.props && Object.hasOwn(comp.props, key) ? comp.props[key] : (defaults[key] ?? 0)}
          spec={specs[key]}
          overridden={overridden?.has(key) ?? false}
          {...handlers}
        />
      ))}
    </>
  )
}

interface ComponentCardProps extends ComponentPropHandlers {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  /** Absent = locked (prefab-owned behaviours, the ui chassis widget). */
  onRemove?: () => void
}

export function ComponentCard({ onRemove, ...rowProps }: ComponentCardProps) {
  const archetype = useArchetype()
  const { comp } = rowProps
  const keys = componentKeys(comp, archetype)
  // The Animator's clip overrides get a row even with none set (issue #173 CA-6): no param declares them.
  const rows = comp.type === 'Animator' && !keys.includes('clips') ? [...keys, 'clips'] : keys
  return (
    <div className="ed-comp">
      <header
        className="ed-comp-head"
        title={onRemove ? undefined : 'defined by the prefab — edit the prefab to change it'}
      >
        <span>{componentLabel(comp.type, archetype)}</span>
        <ComponentUpdateSchedule type={comp.type} />
        {onRemove && (
          <button className="ed-mini" title="Remove component" onClick={onRemove}>
            ✕
          </button>
        )}
      </header>
      {keys.length === 0 && <div className="ed-hint">no parameters</div>}
      <ComponentRows {...rowProps} keys={rows} />
    </div>
  )
}
