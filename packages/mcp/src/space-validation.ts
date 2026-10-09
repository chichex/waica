import {
  componentSpaceMismatch,
  entityTransformIssues,
  sceneSpaceIssues,
  type PrefabJson,
  type SceneJson,
  type SceneSpace,
} from '@waica/engine'
import { componentList } from './component-validation.js'
import { add, type LooseSceneEntity, type ValidationContext } from './validation-context.js'

/** What a scene's space checks need from the scene being validated. */
interface SpaceScope {
  readonly file: string
  readonly context: ValidationContext
}

/**
 * A scene's `render.space`, its camera block against that space, and the
 * render options a 3d scene cannot use (issue #154 CA-13, CA-14). The checks
 * are the engine's pure functions; this only reports them.
 */
export function validateSceneSpace(scene: SceneJson, scope: SpaceScope): void {
  for (const issue of sceneSpaceIssues(scene.render, scene.camera)) {
    const code = issue.field.startsWith('camera.') ? 'invalid-scene-camera' : 'invalid-scene-render'
    add(scope.context, 'error', code, issue.message, scope.file, issue.field)
  }
}

/** One scene entity under validation: its JSON, the name findings refer to it by and its prefab, when it has one. */
interface EntitySubject {
  entity: LooseSceneEntity
  ref: string
  prefab: PrefabJson | undefined
}

/**
 * One entity of a scene: its `position`, `rotation` and `scale` shapes, and
 * every component that does not belong in the scene's space — inline or
 * from its prefab (a 2D component under 3d, a 3D one under 2d).
 */
export function validateEntitySpace(
  { entity, ref: entityRef, prefab }: EntitySubject,
  space: SceneSpace,
  scope: SpaceScope,
): void {
  for (const issue of entityTransformIssues(entity)) {
    add(scope.context, 'error', 'invalid-entity-transform', `Entity "${entityRef}": ${issue.message}`, scope.file, entityRef)
  }
  const reported = new Set<string>()
  for (const component of [...componentList(prefab?.components), ...componentList(entity.components)]) {
    if (reported.has(component.type) || !componentSpaceMismatch(space, component.type)) continue
    reported.add(component.type)
    const kind = space === '3d' ? '2D' : '3D'
    add(
      scope.context,
      'error',
      'component-space-mismatch',
      `Entity "${entityRef}" has component "${component.type}", a ${kind} component, in a ${space} scene.`,
      scope.file,
      entityRef,
    )
  }
}
