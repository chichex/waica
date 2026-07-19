import type { ComponentClass } from './component'
import type { Entity } from './entity'
import type { Game } from './game'

/**
 * Formato de escena de Waica: datos declarativos, git-friendly, editables
 * por el editor visual. La escena es la fuente de verdad; el Game es su
 * proyección en vivo.
 */
export interface SceneComponentJson {
  type: string
  props?: Record<string, unknown>
}

export interface SceneEntityJson {
  name: string
  position?: [number, number]
  components?: SceneComponentJson[]
}

export interface SceneJson {
  waicaScene: 1
  entities: SceneEntityJson[]
}

/** Qué componentes existen y cómo resolver assets del arquetipo (waica:*). */
export interface SceneRegistry {
  components: Record<string, ComponentClass>
  /** Resuelve URIs tipo "waica:dog" a URLs reales de asset. */
  resolveAsset?: (uri: string) => string
}

function resolveProps(
  props: Record<string, unknown> | undefined,
  registry: SceneRegistry,
): Record<string, unknown> {
  if (!props) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    out[key] =
      typeof value === 'string' && value.startsWith('waica:') && registry.resolveAsset
        ? registry.resolveAsset(value)
        : value
  }
  return out
}

/** Instancia una entidad de la escena en el juego. */
export function spawnFromJson(game: Game, json: SceneEntityJson, registry: SceneRegistry): Entity {
  const entity = game.spawn(json.name)
  if (json.position) entity.position.set(json.position[0], json.position[1], 0)
  for (const comp of json.components ?? []) {
    const Class = registry.components[comp.type]
    if (!Class) {
      console.warn(`[waica] componente desconocido en la escena: "${comp.type}" (${json.name})`)
      continue
    }
    entity.add(Class, resolveProps(comp.props, registry) as never)
  }
  return entity
}

/** Carga una escena completa en el juego. */
export function loadScene(game: Game, scene: SceneJson, registry: SceneRegistry): void {
  for (const entityJson of scene.entities) spawnFromJson(game, entityJson, registry)
}
