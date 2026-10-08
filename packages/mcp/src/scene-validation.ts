import { sceneRenderIssues } from '@waica/engine'
import type {
  ParamSpec,
  PrefabJson,
  SceneComponentJson,
  SceneEntityJson,
  SceneJson,
} from '@waica/engine'
import { collisionCategoryFindings } from './collision-category-validation.js'
import { objectRecord } from './component-metadata.js'
import {
  checkComponent,
  componentList,
  componentUpdateIssueKey,
  componentUpdateIssues,
  validateComponentUpdateSchedule,
  validateParamReferences,
} from './component-validation.js'
import { lightParamFindings } from './light-param-validation.js'
import { validateEntitySceneTransition } from './scene-transition-validation.js'
import { validateStateMachines } from './state-machine-validation.js'
import { add, type ValidationContext } from './validation-context.js'

type LooseSceneEntity = Omit<Partial<SceneEntityJson>, 'name'> & { name?: unknown }

/** One scene file and the Project-wide facts its entities are checked against. */
export interface SceneScope {
  readonly file: string
  readonly prefabs: ReadonlyMap<string, PrefabJson>
  readonly uiNames: ReadonlySet<string>
  readonly knownScenes: ReadonlySet<string>
  readonly context: ValidationContext
}

/**
 * A scene entity's own components and overrides over its (possibly missing)
 * prefab. The merged prefab+override component list is resolved lazily: only
 * when a check actually needs it (an override that changes a ref param, a
 * clip-context change, an inline ref:clip lookup that needs the effective
 * sibling AnimatedSprite, or state-machine revalidation). A plain
 * "prefab: ref" entity with no overrides and no inline components never pays
 * for building it.
 */
interface EntityComposition {
  readonly ref: string
  readonly inline: SceneComponentJson[]
  readonly overrides: Record<string, unknown>
  readonly prefab: PrefabJson | undefined
  effective(): SceneComponentJson[]
  isResolved(): boolean
}

type ReferenceScopes = Map<SceneComponentJson, ReadonlySet<string> | undefined>

const STATE_BEHAVIOR_TYPES = new Set(['StateMachine', 'AnimatedSprite'])

function resolvedEntityComponents(
  entity: LooseSceneEntity,
  prefab?: PrefabJson,
): SceneComponentJson[] {
  const overrides = objectRecord(entity.overrides)
  const inherited = componentList(prefab?.components).map((component) => ({
    type: component.type,
    props: {
      ...objectRecord(component.props),
      ...objectRecord(overrides[component.type]),
    },
  }))
  return [...inherited, ...componentList(entity.components)]
}

export function validateScene(scene: SceneJson, scope: SceneScope): void {
  const rawEntities: unknown[] = Array.isArray(scene.entities) ? scene.entities : []
  const entities = rawEntities
    .map((entity, index) => ({ entity, index }))
    .filter(
      (entry): entry is { entity: LooseSceneEntity; index: number } =>
        !!entry.entity && typeof entry.entity === 'object' && !Array.isArray(entry.entity),
    )
  validateSceneCamera(scene, entities.map(({ entity }) => entity), scope)
  // render.lighting and render.post ranges (issue #78 CA-2), one error per field.
  for (const issue of sceneRenderIssues(scene.render)) {
    add(scope.context, 'error', 'invalid-scene-render', issue.message, scope.file, issue.field)
  }
  for (const ui of Array.isArray(scene.ui) ? scene.ui : []) {
    if (typeof ui === 'string' && !scope.uiNames.has(ui)) {
      add(scope.context, 'warning', 'unknown-ui-piece', `Unknown UI piece "${ui}".`, scope.file, ui)
    }
  }
  for (const { entity, index } of entities) validateSceneEntity(entity, index, scope)
}

function validateSceneCamera(
  scene: SceneJson,
  entities: readonly LooseSceneEntity[],
  scope: SceneScope,
): void {
  const entityNames = new Set(
    entities.map((entity) => (typeof entity.name === 'string' ? entity.name : '')).filter(Boolean),
  )
  const follow = scene.camera?.follow
  if (typeof follow === 'string' && follow && !entityNames.has(follow)) {
    add(
      scope.context,
      'warning',
      'camera-follow-unknown-entity',
      `Camera follows unknown entity "${follow}".`,
      scope.file,
      follow,
    )
  }
}

function validateSceneEntity(entity: LooseSceneEntity, index: number, scope: SceneScope): void {
  const { context, file } = scope
  const entityRef =
    typeof entity.name === 'string' && entity.name ? entity.name : `entity[${index}]`
  const inline = componentList(entity.components)
  for (const component of inline) {
    checkComponent(component, file, entityRef, context)
    if (component.type === 'Hitbox') {
      context.findings.push(...collisionCategoryFindings(component.props, file, entityRef))
    }
    if (component.type === 'Light') context.findings.push(...lightParamFindings(component.props, file, entityRef))
  }
  // Only the overridden Light params: the prefab's own are reported at the prefab.
  context.findings.push(...lightParamFindings(objectRecord(entity.overrides)['Light'], file, entityRef))
  context.findings.push(
    ...validateEntitySceneTransition(entity, entityRef, file, scope.prefabs, scope.knownScenes),
  )
  const prefab = validatePrefabReference(entity, entityRef, scope)
  const composition = entityComposition(entity, entityRef, prefab)
  validateEntityParamReferences(composition, scope)

  // Re-evaluate inherited state behavior only when this entity actually
  // changes a StateMachine or AnimatedSprite. Unrelated overrides keep the
  // prefab-level finding as the single source of truth.
  const changesStateBehavior =
    inline.some((component) => STATE_BEHAVIOR_TYPES.has(component.type)) ||
    Object.keys(composition.overrides).some((type) => STATE_BEHAVIOR_TYPES.has(type))
  if (changesStateBehavior) {
    validateStateMachines(composition.effective(), file, entityRef, context)
  }

  // A plain prefab instance inherits the prefab-level result already emitted
  // above. Inline components create a new effective composition; report only
  // the issues they introduce, not every inherited issue again.
  if (inline.length > 0) {
    const inheritedIssues = new Set(
      componentUpdateIssues(componentList(prefab?.components), context).map(
        componentUpdateIssueKey,
      ),
    )
    validateComponentUpdateSchedule(composition.effective(), file, entityRef, context, inheritedIssues)
  }
}

function entityComposition(
  entity: LooseSceneEntity,
  ref: string,
  prefab: PrefabJson | undefined,
): EntityComposition {
  let resolved: SceneComponentJson[] | undefined
  return {
    ref,
    inline: componentList(entity.components),
    overrides: objectRecord(entity.overrides),
    prefab,
    effective: () => (resolved ??= resolvedEntityComponents(entity, prefab)),
    isResolved: () => resolved !== undefined,
  }
}

/** The entity's prefab, after reporting a missing prefab or overrides for components it lacks. */
function validatePrefabReference(
  entity: LooseSceneEntity,
  entityRef: string,
  scope: SceneScope,
): PrefabJson | undefined {
  const prefabRef = typeof entity.prefab === 'string' ? entity.prefab : undefined
  if (!prefabRef) return undefined
  const prefab = scope.prefabs.get(prefabRef)
  if (!prefab) {
    add(
      scope.context,
      'error',
      'broken-prefab-ref',
      `Entity "${entityRef}" references missing prefab "${prefabRef}".`,
      scope.file,
      prefabRef,
    )
    return undefined
  }
  const componentTypes = new Set(componentList(prefab.components).map((component) => component.type))
  for (const override of Object.keys(objectRecord(entity.overrides))) {
    if (!componentTypes.has(override)) {
      add(
        scope.context,
        'warning',
        'override-key-not-in-prefab',
        `Override "${override}" is not a component in prefab "${prefabRef}".`,
        scope.file,
        prefabRef,
      )
    }
  }
  return prefab
}

function declaresRefKind(
  context: ValidationContext,
  type: string,
  kind: NonNullable<ParamSpec['ref']>,
): boolean {
  return Object.values(context.componentMetadata.get(type)?.params ?? {}).some(
    (spec) => spec.ref === kind && spec.options === undefined,
  )
}

function validateEntityParamReferences(composition: EntityComposition, scope: SceneScope): void {
  const { context } = scope
  // Undefined scope means "check every declared ref param" — correct for
  // inline components (never validated elsewhere) and for a component a
  // clip-context change forces a full recheck of. A Set scopes the check
  // to only the override's changed params, so a prefab-level finding for
  // a param the override never touched is not reported a second time
  // under the scene file.
  const referenceScopes: ReferenceScopes = new Map()
  for (const component of composition.inline) referenceScopes.set(component, undefined)
  scopeOverriddenReferences(composition, scope, referenceScopes)
  const changesClipContext =
    composition.inline.some((component) => component.type === 'AnimatedSprite') ||
    Object.hasOwn(composition.overrides, 'AnimatedSprite')
  if (changesClipContext) {
    for (const component of composition.effective()) {
      // A clip-context change can affect params this component didn't
      // itself change, so this always widens to a full check rather than
      // narrowing an already-scoped entry from the override loop.
      if (declaresRefKind(context, component.type, 'clip')) referenceScopes.set(component, undefined)
    }
  }
  const needsSiblings =
    composition.isResolved() ||
    [...referenceScopes.keys()].some((component) => declaresRefKind(context, component.type, 'clip'))
  validateParamReferences(
    [...referenceScopes.entries()].map(([component, only]) => ({ component, only })),
    needsSiblings ? composition.effective() : [...referenceScopes.keys()],
    scope.file,
    context,
  )
}

/** Checks overridden Hitbox categories and scopes each override to the ref params it changes. */
function scopeOverriddenReferences(
  composition: EntityComposition,
  scope: SceneScope,
  referenceScopes: ReferenceScopes,
): void {
  const inlineTypes = new Set(composition.inline.map((component) => component.type))
  for (const [type, rawPatch] of Object.entries(composition.overrides)) {
    const patch = objectRecord(rawPatch)
    if (type === 'Hitbox') {
      scope.context.findings.push(...collisionCategoryFindings(patch, scope.file, composition.ref))
    }
    if (inlineTypes.has(type)) continue
    const changedRefParams = new Set(
      Object.entries(scope.context.componentMetadata.get(type)?.params ?? {})
        .filter(
          ([param, spec]) =>
            spec.ref !== undefined && spec.options === undefined && Object.hasOwn(patch, param),
        )
        .map(([param]) => param),
    )
    if (changedRefParams.size === 0) continue
    const effective = composition.effective().find((component) => component.type === type)
    if (effective && !referenceScopes.has(effective)) referenceScopes.set(effective, changedRefParams)
  }
}
