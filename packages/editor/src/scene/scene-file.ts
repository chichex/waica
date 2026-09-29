import type { PrefabJson, SceneJson } from '@waica/engine'
import { isJsonObject } from '../json-object'

/** A scene file that parsed as JSON but does not have the scene shape. */
export class InvalidSceneFileError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidSceneFileError'
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'

function optional(record: Record<string, unknown>, key: string, check: (value: unknown) => boolean): boolean {
  return record[key] === undefined || check(record[key])
}

const PREFAB_KINDS: readonly unknown[] = ['character', 'object', 'tile']

function isComponent(value: unknown): boolean {
  return isJsonObject(value) && isString(value.type) && optional(value, 'props', isJsonObject)
}

function isComponentList(value: unknown): value is PrefabJson['components'] {
  return Array.isArray(value) && value.every(isComponent)
}

function entitiesProblem(entities: unknown): string | null {
  if (!Array.isArray(entities)) return 'entities must be an array'
  const bad: number = entities.findIndex((entity: unknown) => !isJsonObject(entity))
  return bad < 0 ? null : `entities[${bad}] must be an object`
}

/** Why `value` is not a scene the game can load, or null when it is one. */
function sceneProblem(value: unknown): string | null {
  if (!isJsonObject(value)) return 'a scene file must hold a JSON object'
  return entitiesProblem(value.entities)
}

/**
 * True for what the game's scene loader (and validate_project) accepts: a JSON
 * object whose `entities` is an array of objects. Every other field is read
 * by the loader without validation, so the editor does not reject it either:
 * a scene the game loads must open, play and not block a prefab rename.
 */
export function isSceneJson(value: unknown): value is SceneJson {
  return sceneProblem(value) === null
}

/** Checks every field PrefabJson declares. */
export function isPrefabJson(value: unknown): value is PrefabJson {
  return (
    isJsonObject(value) &&
    value.waicaPrefab === 1 &&
    PREFAB_KINDS.includes(value.type) &&
    isComponentList(value.components)
  )
}

/**
 * The prefab in a prefab file, as the game accepts it: the game imports the
 * file and reads only its `components`. A missing marker or an unknown kind
 * is filled from the file's category, so the editor lists what the game loads.
 */
export function readPrefabFile(value: unknown, category: PrefabJson['type']): PrefabJson | null {
  if (!isJsonObject(value) || !isComponentList(value.components)) return null
  const { type } = value
  const kind = type === 'character' || type === 'object' || type === 'tile' ? type : category
  return { ...value, waicaPrefab: 1, type: kind, components: value.components }
}

/**
 * The scene in a scene file's text. Invalid JSON stays a SyntaxError; JSON
 * that the game cannot load throws InvalidSceneFileError naming the problem,
 * so no caller hands a malformed scene to migrateScene or the Viewport.
 */
export function parseSceneJson(text: string): SceneJson {
  const parsed: unknown = JSON.parse(text)
  const problem = sceneProblem(parsed)
  if (problem !== null || !isSceneJson(parsed)) throw new InvalidSceneFileError(problem ?? 'invalid scene')
  return parsed
}
