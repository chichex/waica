import type { SceneCameraJson } from './camera'
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
  /** Editor-only grouping label; spawning ignores it. */
  folder?: string
}

/** A reusable entity template: a typed bag of components a scene can reference. */
export interface PrefabJson {
  waicaPrefab: 1
  type: 'character' | 'object' | 'tile'
  components: SceneComponentJson[]
}

export interface SceneJson {
  waicaScene: 1 | 2 | 3
  /** The scene's built-in camera (v3); absent = the host keeps control. */
  camera?: SceneCameraJson
  entities: SceneEntityJson[]
  /** UI pieces (src/ui/*.html) mounted visible when the scene loads. */
  ui?: string[]
  /**
   * Editor-only folder registry: keeps empty folders alive and ordered.
   * Folders group entities in the editor's explorer; the runtime ignores them.
   */
  folders?: string[]
}

/** Which components exist and how to resolve archetype assets (waica:*). */
export interface SceneRegistry {
  components: Record<string, ComponentClass>
  /**
   * Resolves asset URIs — "waica:dog" registry keys or project paths like
   * "src/art/hero.png" — to loadable URLs. MUST return unknown strings
   * unchanged: every string prop goes through it.
   */
  resolveAsset?: (uri: string) => string
  /** Prefab definitions keyed by ref ("characters/slime"). */
  prefabs?: Record<string, PrefabJson>
  /** UI piece sources keyed by name ("coin-counter" → its HTML). */
  ui?: Record<string, string>
}

/**
 * Runs every string prop through the registry's asset resolver (if any),
 * recursing into arrays and plain objects — nested textures (e.g. an
 * AnimatedSprite's extraSheets) resolve like top-level ones. Safe because
 * resolvers return unknown strings unchanged.
 */
export function resolveProps(
  props: Record<string, unknown> | undefined,
  registry: SceneRegistry,
): Record<string, unknown> {
  if (!props) return {}
  const resolve = registry.resolveAsset
  if (!resolve) return { ...props }
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return resolve(value)
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object' && value.constructor === Object) {
      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) out[key] = walk(entry)
      return out
    }
    return value
  }
  return walk(props) as Record<string, unknown>
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
  game.registry = registry
  for (const entityJson of scene.entities) spawnFromJson(game, entityJson, registry)
  // After the spawns: with a follow target, the camera starts centered on it.
  game.setSceneCamera(scene.camera)
  if (registry.ui) game.ui.defineAll(registry.ui)
  for (const name of scene.ui ?? []) game.ui.show(name)
}
