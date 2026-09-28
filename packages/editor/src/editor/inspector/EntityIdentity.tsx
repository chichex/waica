import { countOverrides } from '../../scene/ops'
import { NumberField } from '../NumberField'
import type { EntityInspectorProps } from './EntityInspector'

/** The entity's name and scene position. */
export function EntityIdentityRows({
  entity,
  onRename,
  onMove,
}: Pick<EntityInspectorProps, 'entity' | 'onRename' | 'onMove'>) {
  const [x, y] = entity.position ?? [0, 0]
  return (
    <>
      <label className="ed-row">
        <span>name</span>
        <input
          type="text"
          defaultValue={entity.name}
          key={entity.name}
          onBlur={(e) => {
            const next = e.target.value.trim()
            if (next && next !== entity.name) onRename(entity.name, next)
          }}
        />
      </label>
      <div className="ed-row ed-row-xy">
        <span>position</span>
        <NumberField step={0.5} value={x} onChange={(t) => onMove(entity.name, [Number(t), y])} />
        <NumberField step={0.5} value={y} onChange={(t) => onMove(entity.name, [x, Number(t)])} />
      </div>
    </>
  )
}

/** The "instance of <prefab>" chip, with the override count and how to act on overrides. */
export function InstanceChip({ entity, onOpenPrefab }: Pick<EntityInspectorProps, 'entity' | 'onOpenPrefab'>) {
  const overrideCount = countOverrides(entity)
  const prefabRef = entity.prefab
  return (
    <>
      {prefabRef && (
        <button
          className="ed-prefab-chip"
          title="Open this prefab"
          onClick={() => onOpenPrefab(prefabRef)}
        >
          instance of {prefabRef}
          {overrideCount > 0 && ` · ${overrideCount} override${overrideCount === 1 ? '' : 's'}`}
        </button>
      )}
      {overrideCount > 0 && (
        <div className="ed-hint">
          ● marks props changed here — ↺ resets to the prefab's value, ⤒ applies yours to the
          prefab
        </div>
      )}
    </>
  )
}
