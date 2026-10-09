import { countOverrides } from '../../scene/ops'
import { NumberField } from '../NumberField'
import type { EntityInspectorProps } from './EntityInspector'
import { Vec3Row } from './Vec3Row'

/** A 3D scene entity's transform: position (X/Y/Z), rotation in degrees and scale. */
function TransformRows({
  entity,
  onTransform,
}: Pick<EntityInspectorProps, 'entity'> & Required<Pick<EntityInspectorProps, 'onTransform'>>) {
  const [x, y, z = 0] = entity.position ?? [0, 0]
  return (
    <>
      <Vec3Row label="position" value={[x, y, z]} step={0.5} onChange={(position) => onTransform(entity.name, { position })} />
      <Vec3Row label="rotation" value={entity.rotation ?? [0, 0, 0]} step={5} onChange={(rotation) => onTransform(entity.name, { rotation })} />
      <Vec3Row label="scale" value={entity.scale ?? [1, 1, 1]} step={0.1} onChange={(scale) => onTransform(entity.name, { scale })} />
    </>
  )
}

/** The entity's name and scene position (a 3D scene's whole transform). */
export function EntityIdentityRows({
  entity,
  space,
  onRename,
  onMove,
  onTransform,
}: Pick<EntityInspectorProps, 'entity' | 'space' | 'onRename' | 'onMove' | 'onTransform'>) {
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
      {space === '3d' && onTransform ? (
        <TransformRows entity={entity} onTransform={onTransform} />
      ) : (
        <div className="ed-row ed-row-xy">
          <span>position</span>
          <NumberField step={0.5} value={x} onChange={(t) => onMove(entity.name, [Number(t), y])} />
          <NumberField step={0.5} value={y} onChange={(t) => onMove(entity.name, [x, Number(t)])} />
        </div>
      )}
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
