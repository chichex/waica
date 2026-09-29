import { resolveCollisionPoints, type SceneComponentJson } from '@waica/engine'
import { ComponentRows, type ComponentPropHandlers } from './ComponentCard'
import { addPolygonVertex } from './polygon-vertices'
import { OverridableName } from './PropRow'
import { ViewportVisibilityButton } from './ViewportVisibilityButton'

interface CollisionRowsProps extends ComponentPropHandlers {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
}

/** The Collision header, with the viewport toggle while there is a collider to show. */
function CollisionHeader({
  hasCollider,
  viewportVisible,
  onViewportVisibleChange,
}: {
  hasCollider: boolean
  viewportVisible: boolean
  onViewportVisibleChange: (visible: boolean) => void
}) {
  return (
    <header className="ed-sec-head">
      <span>Collision</span>
      {hasCollider && (
        <ViewportVisibilityButton
          label="Collision"
          visible={viewportVisible}
          onChange={onViewportVisibleChange}
        />
      )}
    </header>
  )
}

/** A polygon collider's vertex count and the buttons that add or drop a vertex. */
function PolygonTools({
  comp,
  name,
  onProp,
}: {
  comp: SceneComponentJson
  name: (key: string, label: React.ReactNode) => React.ReactNode
  onProp: ComponentPropHandlers['onProp']
}) {
  const points = resolveCollisionPoints(comp.props?.points)
  return (
    <div className="ed-poly-tools">
      <div className="ed-hint">
        {name('points', `${points.length} vertices — drag them in the viewport`)}
      </div>
      <div>
        <button className="ed-mini" onClick={() => onProp('points', addPolygonVertex(points))}>
          + vertex
        </button>
        <button
          className="ed-mini"
          disabled={points.length <= 3}
          onClick={() => onProp('points', points.slice(0, -1))}
        >
          − last
        </button>
      </div>
    </div>
  )
}

function CollisionRows({ id, comp, overridden, onProp, onReset, onApply }: CollisionRowsProps) {
  const shape =
    comp.props?.shape === 'circle' || comp.props?.shape === 'polygon'
      ? comp.props.shape
      : 'rectangle'
  const name = (key: string, label: React.ReactNode) => (
    <OverridableName
      label={label}
      overridden={overridden?.has(key) ?? false}
      onReset={onReset && (() => onReset(key))}
      onApply={onApply && (() => onApply(key))}
    />
  )
  return (
    <>
      <label className="ed-row">
        {name('shape', 'shape')}
        <select value={shape} onChange={(event) => onProp('shape', event.target.value)}>
          <option value="rectangle">rectangle</option>
          <option value="circle">circle</option>
          <option value="polygon">polygon</option>
        </select>
      </label>
      <ComponentRows
        id={id}
        comp={comp}
        keys={comp.type === 'Hitbox'
          ? ['layer', 'collidesWith', 'width', 'height', 'offsetX', 'offsetY']
          : ['width', 'height', 'offsetX', 'offsetY']}
        overridden={overridden}
        onProp={onProp}
        onReset={onReset}
        onApply={onApply}
      />
      {shape === 'polygon' && <PolygonTools comp={comp} name={name} onProp={onProp} />}
    </>
  )
}

export function CollisionSection({
  comp,
  label,
  viewportVisible,
  onViewportVisibleChange,
  offHint,
  onToggle,
  ...rows
}: Omit<CollisionRowsProps, 'comp'> & {
  comp: SceneComponentJson | null
  /** "solid" | "hitbox" — the chassis' collision kind. */
  label: string
  viewportVisible: boolean
  onViewportVisibleChange: (visible: boolean) => void
  /** Shown when the collision is toggled off. */
  offHint: string
  /** Present only where the chassis allows turning collision off (prefab level). */
  onToggle?: (enabled: boolean) => void
}) {
  return (
    <div className="ed-section">
      <CollisionHeader
        hasCollider={comp != null}
        viewportVisible={viewportVisible}
        onViewportVisibleChange={onViewportVisibleChange}
      />
      {onToggle && (
        <label className="ed-row">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={comp != null}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
      )}
      {comp ? <CollisionRows {...rows} comp={comp} /> : <div className="ed-hint">{offHint}</div>}
    </div>
  )
}

/** Inline entities (no prefab) pick their collision kind directly. */
export function InlineCollisionSection({
  id,
  comp,
  viewportVisible,
  onViewportVisibleChange,
  onProp,
  onSet,
}: {
  id: string
  comp: SceneComponentJson | null
  viewportVisible: boolean
  onViewportVisibleChange: (visible: boolean) => void
  onProp: ComponentPropHandlers['onProp']
  onSet: (type: 'Hitbox' | 'Solid' | null) => void
}) {
  return (
    <div className="ed-section">
      <CollisionHeader
        hasCollider={comp != null}
        viewportVisible={viewportVisible}
        onViewportVisibleChange={onViewportVisibleChange}
      />
      <label className="ed-row">
        <span>type</span>
        <select
          value={comp?.type ?? 'none'}
          onChange={(e) => {
            const kind = e.target.value
            onSet(kind === 'none' ? null : (kind as 'Hitbox' | 'Solid'))
          }}
        >
          <option value="none">none</option>
          <option value="Hitbox">hitbox</option>
          <option value="Solid">solid</option>
        </select>
      </label>
      {comp && <CollisionRows id={id} comp={comp} onProp={onProp} />}
    </div>
  )
}
