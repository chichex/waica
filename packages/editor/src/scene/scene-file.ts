import type { PrefabJson, SceneJson } from '@waica/engine'
import { isJsonObject, isStringArray } from '../json-object'

/** A scene file that parsed as JSON but does not have the scene shape. */
export class InvalidSceneFileError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidSceneFileError'
  }
}

type Check = (value: unknown) => boolean

const isString: Check = (value) => typeof value === 'string'
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value)

function optional(record: Record<string, unknown>, key: string, check: Check): boolean {
  return record[key] === undefined || check(record[key])
}

function isNumberPair(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(isNumber)
}

function isCameraLimits(value: unknown): boolean {
  return isJsonObject(value) && ['minX', 'maxX', 'minY', 'maxY'].every((edge) => isNumber(value[edge]))
}

const SCENE_VERSIONS: readonly unknown[] = [1, 2, 3]
const PREFAB_KINDS: readonly unknown[] = ['character', 'object', 'tile']
const CAMERA_NUMBERS = ['zoom', 'deadzoneWidth', 'deadzoneHeight', 'lookahead', 'lookaheadY', 'smoothing']

function isSceneCamera(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    optional(value, 'position', isNumberPair) &&
    optional(value, 'follow', isString) &&
    optional(value, 'limits', isCameraLimits) &&
    CAMERA_NUMBERS.every((key) => optional(value, key, isNumber))
  )
}

function isSceneRender(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    optional(value, 'sort', (sort) => sort === 'y') &&
    optional(value, 'projection', (projection) => projection === 'isometric')
  )
}

function isComponent(value: unknown): boolean {
  return isJsonObject(value) && isString(value.type) && optional(value, 'props', isJsonObject)
}

function isComponentList(value: unknown): value is PrefabJson['components'] {
  return Array.isArray(value) && value.every(isComponent)
}

function isOverrides(value: unknown): boolean {
  return isJsonObject(value) && Object.values(value).every(isJsonObject)
}

function isSceneEntity(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isString(value.name) &&
    optional(value, 'position', isNumberPair) &&
    optional(value, 'prefab', isString) &&
    optional(value, 'overrides', isOverrides) &&
    optional(value, 'components', isComponentList) &&
    optional(value, 'folder', isString)
  )
}

function entitiesProblem(entities: unknown): string | null {
  if (!Array.isArray(entities)) return 'entities must be an array'
  const bad = entities.findIndex((entity) => !isSceneEntity(entity))
  if (bad < 0) return null
  const entity: unknown = entities[bad]
  const named = isJsonObject(entity) && isString(entity.name)
  return named ? `entities[${bad}] has a field of the wrong type` : `entities[${bad}].name must be a string`
}

/** The optional scene-level fields, each with the reason it names when malformed. */
const SCENE_FIELDS: readonly (readonly [string, Check, string])[] = [
  ['camera', isSceneCamera, 'camera has a field of the wrong type'],
  ['render', isSceneRender, 'render has a field of the wrong type'],
  ['ui', isStringArray, 'ui must be a list of piece names'],
  ['folders', isStringArray, 'folders must be a list of names'],
]

/** Why `value` is not a scene, or null when every field has the scene shape. */
function sceneProblem(value: unknown): string | null {
  if (!isJsonObject(value)) return 'a scene file must hold a JSON object'
  if (!SCENE_VERSIONS.includes(value.waicaScene)) return 'waicaScene must be 1, 2 or 3'
  const invalidField = SCENE_FIELDS.find(([key, check]) => !optional(value, key, check))
  return entitiesProblem(value.entities) ?? invalidField?.[2] ?? null
}

/** Checks every field SceneJson declares, including the camera and every entity. */
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
 * without the scene shape throws InvalidSceneFileError naming the problem,
 * so no caller hands a malformed scene to migrateScene or the Viewport.
 */
export function parseSceneJson(text: string): SceneJson {
  const parsed: unknown = JSON.parse(text)
  const problem = sceneProblem(parsed)
  if (problem !== null || !isSceneJson(parsed)) throw new InvalidSceneFileError(problem ?? 'invalid scene')
  return parsed
}
