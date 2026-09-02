import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import type { ValidationFinding } from './validation.js'

/**
 * CA-16: `SceneTransition.scene` names a scene the Project does not have.
 * Plus the sibling-component rule the component itself only enforces at
 * runtime (`onReady` in packages/behaviors/src/scene-transition.ts): a
 * `trigger:'interact'` SceneTransition needs a sibling `Interactable` or it
 * never fires. Split out of validation.ts (already at the 950-line
 * generation-policy cap): this is the whole rule, called once per prefab and
 * once per scene entity from validation.ts's own loops, which already carry
 * the file/ref context and (for the entity call) the prefab map this needs.
 */
const UNKNOWN_TARGET_CODE = 'unknown-scene-transition-target' as const
const MISSING_INTERACTABLE_CODE = 'scene-transition-missing-interactable' as const

function unknownTargetFinding(carrier: string, file: string, target: string): ValidationFinding {
  return {
    severity: 'warning',
    code: UNKNOWN_TARGET_CODE,
    message: `SceneTransition on "${carrier}" names unknown scene "${target}".`,
    file,
    ref: target,
  }
}

function missingInteractableFinding(carrier: string, file: string): ValidationFinding {
  return {
    severity: 'warning',
    code: MISSING_INTERACTABLE_CODE,
    message: `SceneTransition on "${carrier}" has trigger:"interact" but no sibling Interactable; it will never fire.`,
    file,
    ref: carrier,
  }
}

/** Reads a possibly-untrusted, possibly-absent `scene` prop off parsed JSON. */
function sceneProp(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const scene = (props as Record<string, unknown>).scene
  return typeof scene === 'string' && scene ? scene : undefined
}

/** Reads a possibly-untrusted, possibly-absent `trigger` prop off parsed JSON. */
function triggerProp(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const trigger = (props as Record<string, unknown>).trigger
  return typeof trigger === 'string' && trigger ? trigger : undefined
}

function componentsOf(value: unknown): SceneComponentJson[] {
  return Array.isArray(value)
    ? (value.filter(
        (entry): entry is SceneComponentJson =>
          !!entry && typeof entry === 'object' && typeof (entry as SceneComponentJson).type === 'string',
      ) as SceneComponentJson[])
    : []
}

/** Whether `components` (static JSON, order irrelevant) includes an Interactable. */
function hasInteractable(components: SceneComponentJson[]): boolean {
  return components.some((component) => component.type === 'Interactable')
}

/** A prefab's own SceneTransition component (validatePrefab's sibling call). */
export function validatePrefabSceneTransition(
  prefab: PrefabJson,
  file: string,
  ref: string,
  knownScenes: ReadonlySet<string>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const components = componentsOf(prefab.components)
  for (const component of components) {
    if (component.type !== 'SceneTransition') continue
    const target = sceneProp(component.props)
    if (target && !knownScenes.has(target)) findings.push(unknownTargetFinding(ref, file, target))
    if (triggerProp(component.props) === 'interact' && !hasInteractable(components)) {
      findings.push(missingInteractableFinding(ref, file))
    }
  }
  return findings
}

/**
 * A scene entity's own SceneTransition — inline, or a `scene`/`trigger`
 * override on top of a prefab (validateScene's sibling call; a plain prefab
 * instance with no override touching either is already covered by
 * validatePrefabSceneTransition, so it is deliberately not re-checked here).
 *
 * The Interactable-sibling check looks at the entity's *effective*
 * component set — the prefab's components (if any) plus the entity's inline
 * ones — since either side can supply the Interactable that an inline or
 * overridden `trigger:'interact'` SceneTransition needs. Only type
 * membership matters, not declaration order: this is static validation over
 * JSON, not the runtime array `onReady` scans.
 */
export function validateEntitySceneTransition(
  entity: { components?: unknown; overrides?: unknown; prefab?: unknown },
  entityRef: string,
  file: string,
  prefabs: ReadonlyMap<string, PrefabJson>,
  knownScenes: ReadonlySet<string>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const prefabRef = typeof entity.prefab === 'string' ? entity.prefab : undefined
  const prefabComponents = componentsOf(prefabs.get(prefabRef ?? '')?.components)
  const inline = componentsOf(entity.components)
  const hasSiblingInteractable = hasInteractable([...prefabComponents, ...inline])

  for (const component of inline) {
    if (component.type !== 'SceneTransition') continue
    const target = sceneProp(component.props)
    if (target && !knownScenes.has(target)) {
      findings.push(unknownTargetFinding(entityRef, file, target))
    }
    if (triggerProp(component.props) === 'interact' && !hasSiblingInteractable) {
      findings.push(missingInteractableFinding(entityRef, file))
    }
  }

  const overrides =
    entity.overrides && typeof entity.overrides === 'object'
      ? (entity.overrides as Record<string, unknown>)
      : undefined
  const sceneTransitionOverride = overrides?.SceneTransition
  const overrideTarget = sceneProp(sceneTransitionOverride)
  if (overrideTarget && !knownScenes.has(overrideTarget)) {
    findings.push(unknownTargetFinding(entityRef, file, overrideTarget))
  }
  if (triggerProp(sceneTransitionOverride) === 'interact' && !hasSiblingInteractable) {
    findings.push(missingInteractableFinding(entityRef, file))
  }

  return findings
}
