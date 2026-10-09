import type { SceneComponentJson } from '@waica/engine'
import { colliderCategoryFindings } from './collision-category-validation.js'
import { objectRecord } from './component-metadata.js'
import type { ValidationFinding } from './validation-context.js'

const SHAPES = ['box', 'sphere', 'capsule']

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value)

const isPositive = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value > 0

const isVector3 = (value: unknown, accepts: (part: unknown) => boolean): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(accepts)

const isFiniteNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value)

const isUnitInterval = (value: unknown): boolean => isFiniteNumber(value) && (value as number) >= 0 && (value as number) <= 1

type Finder = (record: Record<string, unknown>) => Array<[field: string, message: string]>

const shapeProblems: Finder = (record) => {
  const found: Array<[string, string]> = []
  if (Object.hasOwn(record, 'shape') && !SHAPES.includes(record.shape as string)) {
    found.push(['shape', `shape must be one of ${SHAPES.join(', ')}; got ${shown(record.shape)}.`])
  }
  if (Object.hasOwn(record, 'size') && !isVector3(record.size, isPositive)) {
    found.push(['size', `size must be three positive numbers [x, y, z]; got ${shown(record.size)}.`])
  }
  if (Object.hasOwn(record, 'offset') && !isVector3(record.offset, isFiniteNumber)) {
    found.push(['offset', `offset must be three finite numbers [x, y, z]; got ${shown(record.offset)}.`])
  }
  return found
}

/** Fields that must be a number meeting `accepts`, and the words that say what they must be. */
function numberProblems(record: Record<string, unknown>, fields: readonly string[], expectation: [string, (v: unknown) => boolean]): Array<[string, string]> {
  const [words, accepts] = expectation
  return fields
    .filter((field) => Object.hasOwn(record, field) && !accepts(record[field]))
    .map((field) => [field, `${field} must be ${words}; got ${shown(record[field])}.`])
}

const rangeProblems: Finder = (record) => [
  ...numberProblems(record, ['radius', 'height'], ['a positive number', isPositive]),
  ...numberProblems(record, ['friction', 'restitution'], ['a number from 0 to 1', isUnitInterval]),
]

/** The authored Collider params that Rapier cannot take or that mean nothing (issue #159 CA-13), one error per field. */
export function colliderParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const record = objectRecord(props)
  const findings: ValidationFinding[] = [...shapeProblems(record), ...rangeProblems(record)].map(([field, message]) => ({
    severity: 'error',
    code: 'invalid-collider-param',
    message: `Collider ${message}`,
    file,
    ref: `${ref}:Collider.${field}`,
  }))
  // The layer and mask rules are the Hitbox's (ADR 0016); a Collider's errors are reported as its own params.
  for (const finding of colliderCategoryFindings(record, file, ref)) {
    findings.push(finding.severity === 'error' ? { ...finding, code: 'invalid-collider-param' } : finding)
  }
  return findings
}

const finding = (code: 'rigid-body-without-collider' | 'character-motor-without-body', message: string, where: { file: string; ref: string }): ValidationFinding => ({
  severity: 'error',
  code,
  message,
  ...where,
})

/** The `type` a RigidBody among these components ends up with: its own prop, or the dynamic default. */
function rigidBodyType(components: readonly SceneComponentJson[]): unknown {
  const rigid = components.filter((component) => component.type === 'RigidBody').at(-1)
  return rigid && Object.hasOwn(objectRecord(rigid.props), 'type') ? objectRecord(rigid.props).type : 'dynamic'
}

/**
 * Entity-level physics findings from the components it ends up with, prefab,
 * overrides and inline (issue #159 CA-14, CA-20): a RigidBody needs a Collider
 * beside it, and a CharacterMotor needs a Collider and a kinematic RigidBody.
 */
export function physicsCompositionFindings(components: readonly SceneComponentJson[], file: string, ref: string): ValidationFinding[] {
  const types = new Set(components.map((component) => component.type))
  const findings: ValidationFinding[] = []
  if (types.has('RigidBody') && !types.has('Collider')) {
    findings.push(finding('rigid-body-without-collider', `Entity "${ref}" has a RigidBody but no Collider; no body is created.`, { file, ref }))
  }
  if (types.has('CharacterMotor') && !(types.has('Collider') && types.has('RigidBody') && rigidBodyType(components) === 'kinematic')) {
    findings.push(
      finding('character-motor-without-body', `Entity "${ref}" has a CharacterMotor, which needs a Collider and a kinematic RigidBody beside it; it does nothing without them.`, { file, ref }),
    )
  }
  return findings
}
