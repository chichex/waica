import { useState } from 'react'
import type { SceneEntityJson, SceneJson } from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'

interface Props {
  scene: SceneJson
  selected: string | null
  onRename(from: string, to: string): void
  onMove(name: string, position: [number, number]): void
  onProp(entity: string, componentType: string, key: string, value: unknown): void
  onAddComponent(entity: string, type: string): void
  onRemoveComponent(entity: string, type: string): void
  onDelete(name: string): void
}

function PropRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange(value: unknown): void
}) {
  if (typeof value === 'boolean') {
    return (
      <label className="ed-row">
        <span>{label}</span>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }
  if (typeof value === 'number' && label === 'color') {
    const hex = `#${Math.max(0, value).toString(16).padStart(6, '0')}`
    return (
      <label className="ed-row">
        <span>{label}</span>
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
        <span>{label}</span>
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
        <span>{label}</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  return (
    <div className="ed-row">
      <span>{label}</span>
      <code className="ed-obj">{'{…}'}</code>
    </div>
  )
}

function ComponentCard({
  entity,
  comp,
  onProp,
  onRemove,
}: {
  entity: SceneEntityJson
  comp: NonNullable<SceneEntityJson['components']>[number]
  onProp(key: string, value: unknown): void
  onRemove(): void
}) {
  const Class = PLATFORMER_REGISTRY.components[comp.type]
  const declared = Object.keys((Class as { params?: Record<string, unknown> } | undefined)?.params ?? {})
  const keys = [...new Set([...Object.keys(comp.props ?? {}), ...declared])]
  return (
    <div className="ed-comp">
      <header className="ed-comp-head">
        <span>{comp.type}</span>
        <button className="ed-mini" title="Quitar componente" onClick={onRemove}>
          ✕
        </button>
      </header>
      {keys.length === 0 && <div className="ed-hint">sin parámetros</div>}
      {keys.map((key) => (
        <PropRow
          key={`${entity.name}.${comp.type}.${key}`}
          label={key}
          value={(comp.props ?? {})[key] ?? 0}
          onChange={(value) => onProp(key, value)}
        />
      ))}
    </div>
  )
}

export function Inspector({
  scene,
  selected,
  onRename,
  onMove,
  onProp,
  onAddComponent,
  onRemoveComponent,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState('')
  const entity = scene.entities.find((e) => e.name === selected)
  if (!entity) {
    return (
      <section className="ed-panel ed-inspector">
        <header className="ed-panel-head">Inspector</header>
        <div className="ed-hint ed-pad">
          Seleccioná una entidad en la escena o en la jerarquía.
          <br />
          <br />
          · click: seleccionar y arrastrar
          <br />
          · shift: snap a 0.5
          <br />
          · rueda: zoom · fondo: paneo
        </div>
      </section>
    )
  }
  const [x, y] = entity.position ?? [0, 0]
  const present = new Set((entity.components ?? []).map((c) => c.type))
  const available = Object.keys(PLATFORMER_REGISTRY.components).filter((t) => !present.has(t))

  return (
    <section className="ed-panel ed-inspector">
      <header className="ed-panel-head">Inspector</header>
      <div className="ed-pad">
        <label className="ed-row">
          <span>nombre</span>
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
          <span>posición</span>
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

        {(entity.components ?? []).map((comp) => (
          <ComponentCard
            key={comp.type}
            entity={entity}
            comp={comp}
            onProp={(key, value) => onProp(entity.name, comp.type, key, value)}
            onRemove={() => onRemoveComponent(entity.name, comp.type)}
          />
        ))}

        <div className="ed-add-comp">
          <select value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">+ componente…</option>
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
              onAddComponent(entity.name, adding)
              setAdding('')
            }}
          >
            agregar
          </button>
        </div>

        <button className="ed-danger" onClick={() => onDelete(entity.name)}>
          🗑 Eliminar entidad
        </button>
      </div>
    </section>
  )
}
