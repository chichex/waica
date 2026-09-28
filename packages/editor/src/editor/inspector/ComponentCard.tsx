import type { SceneComponentJson } from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { collisionParamDiagnostics } from '../collision-category-diagnostics'
import { componentDefaults, componentKeys, componentLabel } from './component-meta'
import { PropRow } from './PropRow'
import { ComponentUpdateSchedule } from './update-schedule'

/** Callbacks a component's prop rows fire, keyed by prop name. */
export interface ComponentPropHandlers {
  onProp: (key: string, value: unknown) => void
  onReset?: (key: string) => void
  onApply?: (key: string) => void
}

export function ComponentRows({
  id,
  comp,
  keys,
  overridden,
  onProp,
  onReset,
  onApply,
}: ComponentPropHandlers & {
  /** Key prefix so React inputs reset when the owner changes. */
  id: string
  comp: SceneComponentJson
  keys: string[]
  overridden?: Set<string>
}) {
  const archetype = useArchetype()
  const defaults = componentDefaults(comp, archetype)
  const specs = archetype.registry.components[comp.type]?.params ?? {}
  return (
    <>
      {keys.map((key) => {
        const value = comp.props && Object.hasOwn(comp.props, key)
          ? comp.props[key]
          : (defaults[key] ?? 0)
        return (
          <PropRow
            key={`${id}.${comp.type}.${key}`}
            label={key}
            spec={specs[key]}
            value={value}
            diagnostics={collisionParamDiagnostics(comp.type, key, value)}
            overridden={overridden?.has(key)}
            onChange={(next) => onProp(key, next)}
            onReset={onReset && (() => onReset(key))}
            onApply={onApply && (() => onApply(key))}
          />
        )
      })}
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

export function ComponentCard({ onRemove, ...rows }: ComponentCardProps) {
  const archetype = useArchetype()
  const { comp } = rows
  const keys = componentKeys(comp, archetype)
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
      <ComponentRows {...rows} keys={keys} />
    </div>
  )
}
