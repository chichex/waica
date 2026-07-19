import type { ComponentClass } from './component'
import type { Entity } from './entity'
import type { Game } from './game'

/**
 * Waica's scene format: declarative, git-friendly data, editable by the
 * visual editor. The scene is the source of truth; the Game is its live
 * projection.
 */
export interface SceneComponentJson {
  type: string
  props?: Record<string, unknown>
}

export interface SceneEntityJson {
  name: string
  position?: [number, number]
  /** Prefab ref like "characters/slime", resolved against SceneRegistry.prefabs. */
  prefab?: string
  /** Per-component prop overrides on top of the prefab: componentType -> propName -> value. */
  overrides?: Record<string, Record<string, unknown>>
  components?: SceneComponentJson[]
}

/** A reusable entity template: a typed bag of components a scene can reference. */
export interface PrefabJson {
  waicaPrefab: 1
  type: 'character' | 'object' | 'tile' | 'ui'
  components: SceneComponentJson[]
}

export interface SceneJson {
  waicaScene: 1 | 2
  entities: SceneEntityJson[]
}

/** Which components exist and how to resolve archetype assets (waica:*). */
export interface SceneRegistry {
  components: Record<string, ComponentClass>
  /** Resolves "waica:dog"-style URIs to real asset URLs. */
  resolveAsset?: (uri: string) => string
  /** Prefab definitions keyed by ref ("characters/slime"). */
  prefabs?: Record<string, PrefabJson>
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

/**
 * Expands an entity's prefab (with its overrides) into the final component
 * list: prefab components first, inline extras appended after. Pure — inputs
 * are never mutated; merged components are fresh objects.
 */
export function resolveEntityComponents(
  entity: SceneEntityJson,
  prefabs?: Record<string, PrefabJson>,
): SceneComponentJson[] {
  const inline = entity.components ?? []
  if (!entity.prefab) return inline
  const prefab = prefabs?.[entity.prefab]
  if (!prefab) {
    console.warn(`[waica] unknown prefab in scene: "${entity.prefab}" (${entity.name})`)
    return inline
  }
  const fromPrefab = prefab.components.map((comp) => ({
    type: comp.type,
    props: { ...comp.props, ...entity.overrides?.[comp.type] },
  }))
  return [...fromPrefab, ...inline]
}

/** Instantiates a scene entity into the game. */
export function spawnFromJson(game: Game, json: SceneEntityJson, registry: SceneRegistry): Entity {
  const entity = game.spawn(json.name)
  if (json.position) entity.position.set(json.position[0], json.position[1], 0)
  for (const comp of resolveEntityComponents(json, registry.prefabs)) {
    const Class = registry.components[comp.type]
    if (!Class) {
      console.warn(`[waica] unknown component in scene: "${comp.type}" (${json.name})`)
      continue
    }
    entity.add(Class, resolveProps(comp.props, registry) as never)
  }
  return entity
}

/** Loads a full scene into the game. */
export function loadScene(game: Game, scene: SceneJson, registry: SceneRegistry): void {
  for (const entityJson of scene.entities) spawnFromJson(game, entityJson, registry)
}
