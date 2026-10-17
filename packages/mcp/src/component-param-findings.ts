import type { SceneComponentJson } from '@waica/engine'
import { checkpointParamFindings } from './checkpoint-param-validation.js'
import { collisionCategoryFindings } from './collision-category-validation.js'
import { objectRecord } from './component-metadata.js'
import { lightParamFindings } from './light-param-validation.js'
import { checkModelShapeIgnored } from './model-reference-validation.js'
import { characterMotorParamFindings, colliderParamFindings, rigidBodyParamFindings } from './physics-param-validation.js'
import { sunParamFindings } from './sun-param-validation.js'
import { shadowParamFindings } from './shadow-param-validation.js'
import type { ValidationContext } from './validation-context.js'

/**
 * The authored-param checks of the engine components that have their own
 * (a Hitbox's collision categories, a Collider's shape and ranges, a
 * RigidBody's type and ranges, a CharacterMotor's ranges, a Checkpoint's
 * spawn offset, a Light's and a Sun's ranges, a Model's leftover shape), for one component of a scene
 * entity or a prefab.
 */
export function checkComponentParams(
  component: SceneComponentJson,
  where: { file: string; ref: string },
  context: ValidationContext,
): void {
  const { file, ref } = where
  if (component.type === 'Hitbox') context.findings.push(...collisionCategoryFindings(component.props, file, ref))
  if (component.type === 'Collider') context.findings.push(...colliderParamFindings(component.props, file, ref))
  if (component.type === 'RigidBody') context.findings.push(...rigidBodyParamFindings(component.props, file, ref))
  if (component.type === 'CharacterMotor') context.findings.push(...characterMotorParamFindings(component.props, file, ref))
  if (component.type === 'Checkpoint') context.findings.push(...checkpointParamFindings(component.props, file, ref))
  if (component.type === 'Light') context.findings.push(...lightParamFindings(component.props, file, ref))
  if (component.type === 'Sun') context.findings.push(...sunParamFindings(component.props, file, ref))
  context.findings.push(...shadowParamFindings(component.type, component.props, where))
  checkModelShapeIgnored(component, where, context)
}

/** Only the Collider, RigidBody, CharacterMotor, Checkpoint, Light and Sun params an entity overrides: the prefab's own are reported at the prefab. */
export function overrideParamFindings(overrides: unknown, file: string, ref: string) {
  const byType = objectRecord(overrides)
  return [
    ...colliderParamFindings(byType['Collider'], file, ref),
    ...rigidBodyParamFindings(byType['RigidBody'], file, ref),
    ...characterMotorParamFindings(byType['CharacterMotor'], file, ref),
    ...checkpointParamFindings(byType['Checkpoint'], file, ref),
    ...lightParamFindings(byType['Light'], file, ref),
    ...sunParamFindings(byType['Sun'], file, ref),
    ...['Sun', 'PointLight', 'Model'].flatMap((type) => shadowParamFindings(type, byType[type], { file, ref })),
  ]
}
