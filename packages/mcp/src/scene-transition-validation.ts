import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import type { ValidationFinding } from './validation.js'

/**
 * CA-16: `SceneTransition.scene` names a scene the Project does not have.
 * Split out of validation.ts (already at the 950-line generation-policy
 * cap): this is the whole rule, called once per prefab and once per scene
 * entity from validation.ts's own loops, which already carry the file/ref
 * context this needs.
 */
const CODE = 'unknown-scene-transition-target' as const

function finding(carrier: string, file: string, target: string): ValidationFinding {
  return {
    severity: 'warning',
    code: CODE,
    message: `SceneTransition on "${carrier}" names unknown scene "${target}".`,
    file,
    ref: target,
  }
}

/** Reads a possibly-untrusted, possibly-absent `scene` prop off parsed JSON. */
function sceneProp(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const scene = (props as Record<string, unknown>).scene
  return typeof scene === 'string' && scene ? scene : undefined
}

function componentsOf(value: unknown): SceneComponentJson[] {
  return Array.isArray(value)
    ? (value.filter(
        (entry): entry is SceneComponentJson =>
          !!entry && typeof entry === 'object' && typeof (entry as SceneComponentJson).type === 'string',
      ) as SceneComponentJson[])
    : []
}

/** A prefab's own SceneTransition component (validatePrefab's sibling call). */
export function validatePrefabSceneTransition(
  prefab: PrefabJson,
  file: string,
  ref: string,
  knownScenes: ReadonlySet<string>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const component of componentsOf(prefab.components)) {
    if (component.type !== 'SceneTransition') continue
    const target = sceneProp(component.props)
    if (target && !knownScenes.has(target)) findings.push(finding(ref, file, target))
  }
  return findings
}

/**
 * A scene entity's own SceneTransition — inline, or a `scene` override on
 * top of a prefab (validateScene's sibling call; a plain prefab instance
 * with no override is already covered by validatePrefabSceneTransition).
 */
export function validateEntitySceneTransition(
  entity: { components?: unknown; overrides?: unknown },
  entityRef: string,
  file: string,
  knownScenes: ReadonlySet<string>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const component of componentsOf(entity.components)) {
    if (component.type !== 'SceneTransition') continue
    const target = sceneProp(component.props)
    if (target && !knownScenes.has(target)) findings.push(finding(entityRef, file, target))
  }
  const overrides =
    entity.overrides && typeof entity.overrides === 'object'
      ? (entity.overrides as Record<string, unknown>)
      : undefined
  const overrideTarget = sceneProp(overrides?.SceneTransition)
  if (overrideTarget && !knownScenes.has(overrideTarget)) {
    findings.push(finding(entityRef, file, overrideTarget))
  }
  return findings
}
