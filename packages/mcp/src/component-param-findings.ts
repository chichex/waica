import type { SceneComponentJson } from '@waica/engine'
import { collisionCategoryFindings } from './collision-category-validation.js'
import { objectRecord } from './component-metadata.js'
import { lightParamFindings } from './light-param-validation.js'
import { checkModelShapeIgnored } from './model-reference-validation.js'
import { sunParamFindings } from './sun-param-validation.js'
import type { ValidationContext } from './validation-context.js'

/**
 * The authored-param checks of the engine components that have their own
 * (a Hitbox's collision categories, a Light's and a Sun's ranges, a Model's
 * leftover shape), for one component of a scene entity or a prefab.
 */
export function checkComponentParams(
  component: SceneComponentJson,
  where: { file: string; ref: string },
  context: ValidationContext,
): void {
  const { file, ref } = where
  if (component.type === 'Hitbox') context.findings.push(...collisionCategoryFindings(component.props, file, ref))
  if (component.type === 'Light') context.findings.push(...lightParamFindings(component.props, file, ref))
  if (component.type === 'Sun') context.findings.push(...sunParamFindings(component.props, file, ref))
  checkModelShapeIgnored(component, where, context)
}

/** Only the Light and Sun params an entity overrides: the prefab's own are reported at the prefab. */
export function overrideParamFindings(overrides: unknown, file: string, ref: string) {
  const byType = objectRecord(overrides)
  return [...lightParamFindings(byType['Light'], file, ref), ...sunParamFindings(byType['Sun'], file, ref)]
}
