import type { SceneJson } from '@waica/engine'

function iconFor(entity: SceneJson['entities'][number]): string {
  const types = new Set((entity.components ?? []).map((c) => c.type))
  if (types.has('PlatformerMovement')) return '🐕'
  if (types.has('Collectible')) return '🪙'
  if (types.has('Hazard')) return '👾'
  if (types.has('Solid')) return '▬'
  return '▢'
}

export function Hierarchy({
  scene,
  selected,
  onSelect,
  onAdd,
}: {
  scene: SceneJson
  selected: string | null
  onSelect(name: string): void
  onAdd(): void
}) {
  return (
    <section className="ed-panel">
      <header className="ed-panel-head">
        <span>Escena</span>
        <button className="ed-mini" title="Nueva entidad" onClick={onAdd}>
          ＋
        </button>
      </header>
      <ul className="ed-hier">
        {scene.entities.map((entity) => (
          <li key={entity.name}>
            <button
              className={`ed-hier-item ${selected === entity.name ? 'is-selected' : ''}`}
              onClick={() => onSelect(entity.name)}
            >
              <span className="ed-hier-icon">{iconFor(entity)}</span>
              {entity.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
