import { useState } from 'react'
import type { PrefabJson, SceneComponentJson, SceneEntityJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { resolveComponents } from '../scene/ops'

/** What the inspector is editing, mirroring the explorer view. */
export type InspectorSelection =
  | { kind: 'entity'; entity: SceneEntityJson }
  | { kind: 'prefab'; ref: string; prefab: PrefabJson }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; dims: [number, number] | null }
  | null

interface Props {
  selection: InspectorSelection
  prefabs: Record<string, PrefabJson>
  onRename(from: string, to: string): void
  onMove(name: string, position: [number, number]): void
  onProp(entity: string, componentType: string, key: string, value: unknown): void
  onAddComponent(entity: string, type: string): void
  onRemoveComponent(entity: string, type: string): void
  onDelete(name: string): void
  onOpenPrefab(ref: string): void
  onPrefabProp(ref: string, componentType: string, key: string, value: unknown): void
  onPrefabAddComponent(ref: string, type: string): void
  onPrefabRemoveComponent(ref: string, type: string): void
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

function ComponentCard({
  id,
  comp,
  overridden,
  onProp,
  onRemove,
}: {
  /** Key prefix so React inputs reset when the owner changes. */
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  onProp(key: string, value: unknown): void
  onRemove(): void
}) {
  const Class = ACTIVE_ARCHETYPE.registry.components[comp.type]
  const declared = Object.keys(Class?.params ?? {})
  const keys = [...new Set([...Object.keys(comp.props ?? {}), ...declared])]
  // Unset params show the class defaults (what the game actually runs), so
  // their value AND type match reality — e.g. a boolean renders as a checkbox.
  const defaults = (Class ? new Class() : {}) as unknown as Record<string, unknown>
  return (
    <div className="ed-comp">
      <header className="ed-comp-head">
        <span>{comp.type}</span>
        <button className="ed-mini" title="Remove component" onClick={onRemove}>
          ✕
        </button>
      </header>
      {keys.length === 0 && <div className="ed-hint">no parameters</div>}
      {keys.map((key) => (
        <PropRow
          key={`${id}.${comp.type}.${key}`}
          label={key}
          value={(comp.props ?? {})[key] ?? defaults[key] ?? 0}
          overridden={overridden?.has(key)}
          onChange={(value) => onProp(key, value)}
        />
      ))}
    </div>
  )
}

function AddComponentRow({ present, onAdd }: { present: Set<string>; onAdd(type: string): void }) {
  const [adding, setAdding] = useState('')
  const available = Object.keys(ACTIVE_ARCHETYPE.registry.components).filter(
    (t) => !present.has(t),
  )
  return (
    <div className="ed-add-comp">
      <select value={adding} onChange={(e) => setAdding(e.target.value)}>
        <option value="">+ component…</option>
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
  onDelete,
  onOpenPrefab,
}: Omit<Props, 'selection' | 'onPrefabProp' | 'onPrefabAddComponent' | 'onPrefabRemoveComponent'> & {
  entity: SceneEntityJson
}) {
  const [x, y] = entity.position ?? [0, 0]
  const components = resolveComponents(entity, prefabs)
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

      {components.map((comp) => (
        <ComponentCard
          key={comp.type}
          id={entity.name}
          comp={comp}
          overridden={new Set(Object.keys(entity.overrides?.[comp.type] ?? {}))}
          onProp={(key, value) => onProp(entity.name, comp.type, key, value)}
          onRemove={() => onRemoveComponent(entity.name, comp.type)}
        />
      ))}

      <AddComponentRow
        present={new Set(components.map((c) => c.type))}
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
}: {
  refName: string
  prefab: PrefabJson
  onProp(componentType: string, key: string, value: unknown): void
  onAdd(type: string): void
  onRemove(type: string): void
}) {
  const base = refName.slice(refName.indexOf('/') + 1)
  return (
    <div className="ed-pad">
      <RoRow label="name" value={base} />
      <div className="ed-hint">every instance of this prefab shares these components</div>
      {prefab.components.map((comp) => (
        <ComponentCard
          key={comp.type}
          id={refName}
          comp={comp}
          onProp={(key, value) => onProp(comp.type, key, value)}
          onRemove={() => onRemove(comp.type)}
        />
      ))}
      <AddComponentRow present={new Set(prefab.components.map((c) => c.type))} onAdd={onAdd} />
    </div>
  )
}

function ScriptInspector({ name }: { name: string }) {
  const Class = ACTIVE_ARCHETYPE.registry.components[name]
  if (!Class) return <div className="ed-hint ed-pad">unknown script</div>
  const defaults = new Class() as unknown as Record<string, unknown>
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
        {Object.entries(Class.params ?? {}).map(([key, spec]) => (
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
        />
      )}
      {selection?.kind === 'script' && <ScriptInspector name={selection.name} />}
      {selection?.kind === 'art' && (
        <div className="ed-pad">
          <RoRow label="name" value={selection.label} />
          <RoRow
            label="size"
            value={selection.dims ? `${selection.dims[0]} × ${selection.dims[1]}` : '…'}
          />
        </div>
      )}
    </section>
  )
}
