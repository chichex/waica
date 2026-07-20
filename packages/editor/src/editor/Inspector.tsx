import { useState } from 'react'
import { missingClips, type PrefabJson, type SceneComponentJson, type SceneEntityJson } from '@waica/engine'
import { PLATFORMER_ANIMATION_CONTRACT } from '@waica/behaviors'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { prefabOwns, resolveComponents } from '../scene/ops'
import { behaviourTypes, CHASSIS, splitComponents } from '../project/chassis'
import { clipSummary } from '../project/clips'
import type { ClipDef } from '@waica/engine'

/** What the inspector is editing, mirroring the explorer view. */
export type InspectorSelection =
  | { kind: 'entity'; entity: SceneEntityJson }
  | { kind: 'prefab'; ref: string; prefab: PrefabJson }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; dims: [number, number] | null }
  | null

/** Whose AnimatedSprite the animation editor should open on. */
export type AnimTarget = { kind: 'prefab'; ref: string } | { kind: 'entity'; name: string }

function clipsOf(comp: SceneComponentJson): Record<string, ClipDef> {
  return (comp.props?.clips as Record<string, ClipDef> | undefined) ?? {}
}

/** Contract gaps for a character's AnimatedSprite, as an inline warning. */
function characterClipsWarning(comp: SceneComponentJson): string | undefined {
  const missing = missingClips(PLATFORMER_ANIMATION_CONTRACT, Object.keys(clipsOf(comp)))
  return missing.length ? `missing clips: ${missing.join(', ')}` : undefined
}

interface Props {
  selection: InspectorSelection
  prefabs: Record<string, PrefabJson>
  onRename(from: string, to: string): void
  onMove(name: string, position: [number, number]): void
  onProp(entity: string, componentType: string, key: string, value: unknown): void
  onAddComponent(entity: string, type: string): void
  onRemoveComponent(entity: string, type: string): void
  onSetEntityCollision(entity: string, type: 'Hitbox' | 'Solid' | null): void
  onDelete(name: string): void
  onOpenPrefab(ref: string): void
  onPrefabProp(ref: string, componentType: string, key: string, value: unknown): void
  onPrefabAddComponent(ref: string, type: string): void
  onPrefabRemoveComponent(ref: string, type: string): void
  onPrefabToggleAnimated(ref: string): void
  onPrefabSetCollision(ref: string, enabled: boolean): void
  onEditAnimation(target: AnimTarget): void
}

function componentKeys(comp: SceneComponentJson): string[] {
  const Class = ACTIVE_ARCHETYPE.registry.components[comp.type]
  const declared = Object.keys(Class?.params ?? {})
  return [...new Set([...Object.keys(comp.props ?? {}), ...declared])]
}

// Unset params show the class defaults (what the game actually runs), so
// their value AND type match reality — e.g. a boolean renders as a checkbox.
function componentDefaults(comp: SceneComponentJson): Record<string, unknown> {
  const Class = ACTIVE_ARCHETYPE.registry.components[comp.type]
  return (Class ? new Class() : {}) as unknown as Record<string, unknown>
}

/** Behaviours present that implement onCollide — they need a hitbox to fire. */
function touchBehaviourNames(comps: SceneComponentJson[]): string[] {
  return comps
    .map((c) => c.type)
    .filter((t) => {
      const Class = ACTIVE_ARCHETYPE.registry.components[t] as
        | { prototype: Record<string, unknown> }
        | undefined
      return typeof Class?.prototype.onCollide === 'function'
    })
}

function PropRow({
  label,
  value,
  overridden = false,
  onChange,
}: {
  label: string
  value: unknown
  /** Instance override on top of the prefab value: marked with a dot. */
  overridden?: boolean
  onChange(value: unknown): void
}) {
  const name = (
    <span>
      {label}
      {overridden && <i className="ed-dot" title="overridden on this instance" />}
    </span>
  )
  if (typeof value === 'boolean') {
    return (
      <label className="ed-row">
        {name}
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }
  if (typeof value === 'number' && label === 'color') {
    const hex = `#${Math.max(0, value).toString(16).padStart(6, '0')}`
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
  if (typeof value === 'number') {
    return (
      <label className="ed-row">
        {name}
        <input
          type="number"
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    )
  }
  if (typeof value === 'string') {
    return (
      <label className="ed-row">
        {name}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  return (
    <div className="ed-row">
      {name}
      <code className="ed-obj">{'{…}'}</code>
    </div>
  )
}

function RoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ed-row">
      <span>{label}</span>
      <span className="ed-ro">{value}</span>
    </div>
  )
}

function ComponentRows({
  id,
  comp,
  keys,
  overridden,
  onProp,
}: {
  /** Key prefix so React inputs reset when the owner changes. */
  id: string
  comp: SceneComponentJson
  keys: string[]
  overridden?: Set<string>
  onProp(key: string, value: unknown): void
}) {
  const defaults = componentDefaults(comp)
  return (
    <>
      {keys.map((key) => (
        <PropRow
          key={`${id}.${comp.type}.${key}`}
          label={key}
          value={(comp.props ?? {})[key] ?? defaults[key] ?? 0}
          overridden={overridden?.has(key)}
          onChange={(value) => onProp(key, value)}
        />
      ))}
    </>
  )
}

function ComponentCard({
  id,
  comp,
  overridden,
  onProp,
  onRemove,
}: {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  onProp(key: string, value: unknown): void
  /** Absent = locked (prefab-owned behaviours, the ui chassis widget). */
  onRemove?(): void
}) {
  const keys = componentKeys(comp)
  return (
    <div className="ed-comp">
      <header
        className="ed-comp-head"
        title={onRemove ? undefined : 'defined by the prefab — edit the prefab to change it'}
      >
        <span>{comp.type}</span>
        {onRemove && (
          <button className="ed-mini" title="Remove component" onClick={onRemove}>
            ✕
          </button>
        )}
      </header>
      {keys.length === 0 && <div className="ed-hint">no parameters</div>}
      <ComponentRows id={id} comp={comp} keys={keys} overridden={overridden} onProp={onProp} />
    </div>
  )
}

/** Raw AnimatedSprite props managed by the animation editor, not shown as rows. */
const ANIMATION_KEYS = new Set(['clips', 'cols', 'rows', 'initialClip', 'current'])

function AppearanceSection({
  id,
  comp,
  overridden,
  clipsWarning,
  onProp,
  onToggleAnimated,
  onEditAnimation,
}: {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  /** Contract gaps shown inline (characters). */
  clipsWarning?: string
  onProp(key: string, value: unknown): void
  /** Present only where the chassis allows animated <-> static (object prefabs). */
  onToggleAnimated?(): void
  /** Opens the animation editor (AnimatedSprite only). */
  onEditAnimation?(): void
}) {
  const animated = comp.type === 'AnimatedSprite'
  const keys = componentKeys(comp).filter((k) => !animated || !ANIMATION_KEYS.has(k))
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Appearance</header>
      {onToggleAnimated && (
        <label className="ed-row">
          <span>animated</span>
          <input type="checkbox" checked={animated} onChange={onToggleAnimated} />
        </label>
      )}
      <ComponentRows id={id} comp={comp} keys={keys} overridden={overridden} onProp={onProp} />
      {animated && (
        <>
          <RoRow label="clips" value={clipSummary(clipsOf(comp))} />
          {clipsWarning && <div className="ed-hint ed-warn">{clipsWarning}</div>}
          {onEditAnimation && (
            <button className="ed-wide" onClick={onEditAnimation}>
              🎞 Edit animation…
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CollisionSection({
  id,
  comp,
  label,
  overridden,
  offHint,
  onProp,
  onToggle,
}: {
  id: string
  comp: SceneComponentJson | null
  /** "solid" | "hitbox" — the chassis' collision kind. */
  label: string
  overridden?: Set<string>
  /** Shown when the collision is toggled off. */
  offHint: string
  onProp(key: string, value: unknown): void
  /** Present only where the chassis allows turning collision off (prefab level). */
  onToggle?(enabled: boolean): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Collision</header>
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
      {comp ? (
        <ComponentRows
          id={id}
          comp={comp}
          keys={['width', 'height']}
          overridden={overridden}
          onProp={onProp}
        />
      ) : (
        <div className="ed-hint">{offHint}</div>
      )}
    </div>
  )
}

/** Inline entities (no prefab) pick their collision kind directly. */
function InlineCollisionSection({
  id,
  comp,
  onProp,
  onSet,
}: {
  id: string
  comp: SceneComponentJson | null
  onProp(key: string, value: unknown): void
  onSet(type: 'Hitbox' | 'Solid' | null): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Collision</header>
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
      {comp && <ComponentRows id={id} comp={comp} keys={['width', 'height']} onProp={onProp} />}
    </div>
  )
}

function BehavioursSection({
  id,
  comps,
  present,
  canRemove,
  overriddenFor,
  onProp,
  onRemove,
  onAdd,
}: {
  id: string
  comps: SceneComponentJson[]
  present: Set<string>
  canRemove(comp: SceneComponentJson): boolean
  overriddenFor?(type: string): Set<string> | undefined
  onProp(type: string, key: string, value: unknown): void
  onRemove(type: string): void
  onAdd(type: string): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Behaviours</header>
      {comps.length === 0 && <div className="ed-hint">no behaviours yet</div>}
      {comps.map((comp) => (
        <ComponentCard
          key={comp.type}
          id={id}
          comp={comp}
          overridden={overriddenFor?.(comp.type)}
          onProp={(key, value) => onProp(comp.type, key, value)}
          onRemove={canRemove(comp) ? () => onRemove(comp.type) : undefined}
        />
      ))}
      <AddComponentRow present={present} onAdd={onAdd} />
    </div>
  )
}

function AddComponentRow({ present, onAdd }: { present: Set<string>; onAdd(type: string): void }) {
  const [adding, setAdding] = useState('')
  const available = behaviourTypes(Object.keys(ACTIVE_ARCHETYPE.registry.components)).filter(
    (t) => !present.has(t),
  )
  return (
    <div className="ed-add-comp">
      <select value={adding} onChange={(e) => setAdding(e.target.value)}>
        <option value="">+ behaviour…</option>
        {available.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        className="ed-mini"
        disabled={!adding}
        onClick={() => {
          onAdd(adding)
          setAdding('')
        }}
      >
        add
      </button>
    </div>
  )
}

function EntityInspector({
  entity,
  prefabs,
  onRename,
  onMove,
  onProp,
  onAddComponent,
  onRemoveComponent,
  onSetEntityCollision,
  onDelete,
  onOpenPrefab,
  onEditAnimation,
}: Omit<
  Props,
  | 'selection'
  | 'onPrefabProp'
  | 'onPrefabAddComponent'
  | 'onPrefabRemoveComponent'
  | 'onPrefabToggleAnimated'
  | 'onPrefabSetCollision'
> & {
  entity: SceneEntityJson
}) {
  const [x, y] = entity.position ?? [0, 0]
  const components = resolveComponents(entity, prefabs)
  const prefab = entity.prefab ? prefabs[entity.prefab] : undefined
  const rule = prefab ? CHASSIS[prefab.type] : undefined
  const split = splitComponents(components)
  const appearance = split.appearance
  const collision = split.collision
  const overridesOf = (type: string) => new Set(Object.keys(entity.overrides?.[type] ?? {}))
  return (
    <div className="ed-pad">
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
        <input
          type="number"
          step={0.5}
          value={x}
          onChange={(e) => onMove(entity.name, [Number(e.target.value), y])}
        />
        <input
          type="number"
          step={0.5}
          value={y}
          onChange={(e) => onMove(entity.name, [x, Number(e.target.value)])}
        />
      </div>

      {entity.prefab && (
        <button
          className="ed-prefab-chip"
          title="Open this prefab"
          onClick={() => onOpenPrefab(entity.prefab as string)}
        >
          instance of {entity.prefab}
        </button>
      )}

      {appearance && (
        <AppearanceSection
          id={entity.name}
          comp={appearance}
          overridden={overridesOf(appearance.type)}
          clipsWarning={
            prefab?.type === 'character' ? characterClipsWarning(appearance) : undefined
          }
          onProp={(key, value) => onProp(entity.name, appearance.type, key, value)}
          onEditAnimation={
            appearance.type === 'AnimatedSprite'
              ? () =>
                  onEditAnimation(
                    entity.prefab && prefabOwns(entity, appearance.type, prefabs)
                      ? { kind: 'prefab', ref: entity.prefab }
                      : { kind: 'entity', name: entity.name },
                  )
              : undefined
          }
        />
      )}

      {prefab
        ? rule?.collision && (
            <CollisionSection
              id={entity.name}
              comp={collision}
              label={rule.collision.type.toLowerCase()}
              overridden={collision ? overridesOf(collision.type) : undefined}
              offHint="no collision — defined by the prefab"
              onProp={(key, value) => collision && onProp(entity.name, collision.type, key, value)}
            />
          )
        : (
            <InlineCollisionSection
              id={entity.name}
              comp={collision}
              onProp={(key, value) => collision && onProp(entity.name, collision.type, key, value)}
              onSet={(type) => onSetEntityCollision(entity.name, type)}
            />
          )}

      <BehavioursSection
        id={entity.name}
        comps={[...split.behaviours, ...split.extras]}
        present={new Set(components.map((c) => c.type))}
        canRemove={(c) => !prefabOwns(entity, c.type, prefabs)}
        overriddenFor={overridesOf}
        onProp={(type, key, value) => onProp(entity.name, type, key, value)}
        onRemove={(type) => onRemoveComponent(entity.name, type)}
        onAdd={(type) => onAddComponent(entity.name, type)}
      />

      <button className="ed-danger" onClick={() => onDelete(entity.name)}>
        🗑 Delete entity
      </button>
    </div>
  )
}

function PrefabInspector({
  refName,
  prefab,
  onProp,
  onAdd,
  onRemove,
  onToggleAnimated,
  onSetCollision,
  onEditAnimation,
}: {
  refName: string
  prefab: PrefabJson
  onProp(componentType: string, key: string, value: unknown): void
  onAdd(type: string): void
  onRemove(type: string): void
  onToggleAnimated(): void
  onSetCollision(enabled: boolean): void
  onEditAnimation(): void
}) {
  const base = refName.slice(refName.indexOf('/') + 1)
  const rule = CHASSIS[prefab.type]
  const split = splitComponents(prefab.components)
  const appearance = split.appearance
  const touching = touchBehaviourNames(split.behaviours)
  const offHint =
    rule.collision?.type === 'Solid'
      ? 'no collision — this tile is decor'
      : touching.length
        ? `no hitbox — ${touching.join('/')} won't react`
        : 'no hitbox — this object is decorative'
  return (
    <div className="ed-pad">
      <RoRow label="name" value={base} />
      <div className="ed-hint">every instance of this prefab shares these components</div>
      {appearance && (
        <AppearanceSection
          id={refName}
          comp={appearance}
          clipsWarning={
            prefab.type === 'character' ? characterClipsWarning(appearance) : undefined
          }
          onProp={(key, value) => onProp(appearance.type, key, value)}
          onToggleAnimated={rule.appearance === 'switchable' ? onToggleAnimated : undefined}
          onEditAnimation={appearance.type === 'AnimatedSprite' ? onEditAnimation : undefined}
        />
      )}
      {rule.collision && (
        <CollisionSection
          id={refName}
          comp={split.collision}
          label={rule.collision.type.toLowerCase()}
          offHint={offHint}
          onProp={(key, value) => rule.collision && onProp(rule.collision.type, key, value)}
          onToggle={rule.collision.optional ? onSetCollision : undefined}
        />
      )}
      <BehavioursSection
        id={refName}
        comps={[...split.behaviours, ...split.extras]}
        present={new Set(prefab.components.map((c) => c.type))}
        canRemove={(c) => !(prefab.type === 'ui' && c.type === 'HudCounter')}
        onProp={onProp}
        onRemove={onRemove}
        onAdd={onAdd}
      />
    </div>
  )
}

function ScriptInspector({ name }: { name: string }) {
  const Class = ACTIVE_ARCHETYPE.registry.components[name]
  if (!Class) return <div className="ed-hint ed-pad">unknown script</div>
  const defaults = new Class() as unknown as Record<string, unknown>
  const params = Object.entries(Class.params ?? {})
  return (
    <div className="ed-pad">
      <RoRow label="name" value={name} />
      <div className="ed-hint">
        params declared in the code — the editor shows them as sliders wherever this script is
        used:
      </div>
      <div className="ed-comp">
        <header className="ed-comp-head">
          <span>params</span>
        </header>
        {params.length === 0 && <div className="ed-hint">no parameters</div>}
        {params.map(([key, spec]) => (
          <div
            className="ed-row"
            key={key}
            title={`min ${spec.min ?? '—'} · max ${spec.max ?? '—'} · step ${spec.step ?? '—'}`}
          >
            <span>{spec.label ?? key}</span>
            <span className="ed-ro">{String(defaults[key] ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Inspector(props: Props) {
  const { selection } = props
  return (
    <section className="ed-panel ed-inspector">
      <header className="ed-panel-head">Inspector</header>
      {selection == null && <div className="ed-hint ed-pad">nothing selected</div>}
      {selection?.kind === 'entity' && <EntityInspector {...props} entity={selection.entity} />}
      {selection?.kind === 'prefab' && (
        <PrefabInspector
          refName={selection.ref}
          prefab={selection.prefab}
          onProp={(type, key, value) => props.onPrefabProp(selection.ref, type, key, value)}
          onAdd={(type) => props.onPrefabAddComponent(selection.ref, type)}
          onRemove={(type) => props.onPrefabRemoveComponent(selection.ref, type)}
          onToggleAnimated={() => props.onPrefabToggleAnimated(selection.ref)}
          onSetCollision={(enabled) => props.onPrefabSetCollision(selection.ref, enabled)}
          onEditAnimation={() => props.onEditAnimation({ kind: 'prefab', ref: selection.ref })}
        />
      )}
      {selection?.kind === 'script' && <ScriptInspector name={selection.name} />}
      {selection?.kind === 'art' && (
        <div className="ed-pad">
          <RoRow label="name" value={selection.label} />
          <RoRow
            label="size"
            value={selection.dims ? `${selection.dims[0]} × ${selection.dims[1]} px` : '…'}
          />
        </div>
      )}
    </section>
  )
}
