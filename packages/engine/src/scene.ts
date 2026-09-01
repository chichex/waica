import type { SceneCameraJson } from './camera.js'
import type { ComponentClass } from './component.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'

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

/** Scene-wide render options (v3). */
export interface SceneRenderJson {
  /**
   * 'y' orders same-layer sprites by their render-space Y — lower Y renders
   * in front (top-down depth). Absent: spawn order breaks same-layer ties.
   */
  sort?: 'y'
  /** Logical positions are projected to the fixed 2:1 render lattice. */
  projection?: 'isometric'
}

export interface SceneJson {
  waicaScene: 1 | 2 | 3
  /** The scene's built-in camera (v3); absent = the host keeps control. */
  camera?: SceneCameraJson
  /** Draw-order policy (v3); absent = layer bands with spawn-order ties. */
  render?: SceneRenderJson
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
 * Own-property lookup. Scene JSON is data — a component or prefab named
 * "constructor" or "toString" must read as missing, not as whatever sits
 * on Object.prototype.
 */
export function registryEntry<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined
  return record[key]
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
  const prefab = registryEntry(prefabs, entity.prefab)
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
    const Class = registryEntry(registry.components, comp.type)
    if (!Class) {
      console.warn(`[waica] unknown component in scene: "${comp.type}" (${json.name})`)
      continue
    }
    // The registry now carries project-owned classes, i.e. arbitrary user
    // code. A throwing constructor or onReady costs that one component —
    // never the rest of the scene, and never the editor hosting it.
    try {
      entity.add(Class, resolveProps(comp.props, registry) as never)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[waica] component "${comp.type}" failed on "${json.name}": ${message}`)
    }
  }
  return entity
}

/**
 * Loads a full scene into the game, replacing whatever scene is already
 * live (Game.unloadScene() first) — see ADR 0011. A Game shows one scene
 * at a time.
 */
export function loadScene(game: Game, scene: SceneJson, registry: SceneRegistry): void {
  if (game.registry) game.unloadScene()
  game.registry = registry
  game.setSceneRender(scene.render)
  for (const entityJson of scene.entities) spawnFromJson(game, entityJson, registry)
  // After the spawns: with a follow target, the camera starts centered on it.
  game.setSceneCamera(scene.camera)
  if (registry.ui) game.ui.defineAll(registry.ui)
  // Scene-scoped: Game.unloadScene() unmounts these along with the entities.
  for (const name of scene.ui ?? []) game.ui.show(name, { scope: 'scene' })
}
