import { authoringDefaults, Collider, RigidBody, type ParamSpec, type SceneComponentJson } from '@waica/engine'
import { colliderCategoryFindings } from './collision-category-validation.js'
import { objectRecord } from './component-metadata.js'
import type { FindingCode, ValidationFinding } from './validation-context.js'

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value)

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isVector3 = (value: unknown, accepts: (part: unknown) => boolean): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(accepts)

const isPositive = (value: unknown): boolean => isFiniteNumber(value) && value > 0

/** Why `value` breaks the range the param's spec declares, or null when it fits. */
function rangeProblem(name: string, spec: ParamSpec, value: unknown): string | null {
  if (!isFiniteNumber(value)) return `${name} must be a finite number; got ${shown(value)}.`
  const { min, max } = spec
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    if (min !== undefined && max !== undefined) return `${name} must be a number from ${min} to ${max}; got ${shown(value)}.`
    return `${name} must be at ${max === undefined ? `least ${min}` : `most ${max}`}; got ${shown(value)}.`
  }
  return null
}

/**
 * Why `value` breaks what the param's own spec declares — its `options`, its
 * `vector3` kind, or the range of a number — or null. Read from the class, so
 * the inspector and `validate_project` never disagree on a range.
 */
function specProblem({ name, spec, numeric }: { name: string; spec: ParamSpec; numeric: boolean }, value: unknown): string | null {
  if (spec.options) {
    return typeof value === 'string' && spec.options.includes(value) ? null : `${name} must be one of ${spec.options.join(', ')}; got ${shown(value)}.`
  }
  if (spec.kind === 'vector3') return isVector3(value, isFiniteNumber) ? null : `${name} must be three finite numbers [x, y, z]; got ${shown(value)}.`
  return numeric ? rangeProblem(name, spec, value) : null
}

/** The authored params of `Class` (those its inspector declares) that break their own spec, in the spec's order. */
function specProblems(Class: typeof Collider | typeof RigidBody, record: Record<string, unknown>, skip: readonly string[]): Array<[string, string]> {
  const defaults = authoringDefaults(Class)
  const params: Readonly<Record<string, ParamSpec>> = Class.params
  const found: Array<[string, string]> = []
  for (const [name, spec] of Object.entries(params)) {
    if (skip.includes(name) || !Object.hasOwn(record, name)) continue
    const problem = specProblem({ name, spec, numeric: typeof defaults[name] === 'number' }, record[name])
    if (problem !== null) found.push([name, problem])
  }
  return found
}

/** A box's `size` is three positive numbers, more than the vector its spec declares. */
function sizeProblems(record: Record<string, unknown>): Array<[string, string]> {
  if (!Object.hasOwn(record, 'size') || isVector3(record.size, isPositive)) return []
  return [['size', `size must be three positive numbers [x, y, z]; got ${shown(record.size)}.`]]
}

/**
 * A capsule shorter than twice its radius would silently simulate as a
 * sphere of diameter 2 * radius, taller than declared (the runtime refuses
 * it). Judged on the values the body would get: authored or the defaults.
 */
function capsuleProblems(record: Record<string, unknown>, flagged: readonly string[]): Array<[string, string]> {
  const defaults = authoringDefaults(Collider)
  const shape = Object.hasOwn(record, 'shape') ? record.shape : defaults.shape
  const radius = Object.hasOwn(record, 'radius') ? record.radius : defaults.radius
  const height = Object.hasOwn(record, 'height') ? record.height : defaults.height
  if (shape !== 'capsule' || flagged.includes('radius') || flagged.includes('height')) return []
  if (!isFiniteNumber(radius) || !isFiniteNumber(height) || height >= 2 * radius) return []
  return [['height', `height must be at least twice the radius for a capsule (${2 * radius}); got ${shown(height)}.`]]
}

function toFindings(problems: Array<[string, string]>, where: { code: FindingCode; component: string; file: string; ref: string }): ValidationFinding[] {
  const { code, component, file, ref } = where
  return problems.map(([field, message]) => ({ severity: 'error', code, message: `${component} ${message}`, file, ref: `${ref}:${component}.${field}` }))
}

/**
 * The authored Collider params that Rapier cannot take or that mean nothing
 * (issue #159 CA-13), one error per field: the shape and ranges come from
 * `Collider.params`, a box's size must be positive, a capsule at least twice
 * its radius tall, and the layer and mask follow the Hitbox's rules.
 */
export function colliderParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const record = objectRecord(props)
  const problems = [...sizeProblems(record), ...specProblems(Collider, record, ['size', 'layer', 'collidesWith'])]
  problems.push(...capsuleProblems(record, problems.map(([field]) => field)))
  const findings = toFindings(problems, { code: 'invalid-collider-param', component: 'Collider', file, ref })
  // The layer and mask rules are the Hitbox's (ADR 0016); a Collider's errors are reported as its own params.
  for (const finding of colliderCategoryFindings(record, file, ref)) {
    findings.push(finding.severity === 'error' ? { ...finding, code: 'invalid-collider-param' } : finding)
  }
  return findings
}

/**
 * The authored RigidBody params the body cannot be built from (PR #161
 * review): a `type` outside its options, a number outside the range
 * `RigidBody.params` declares, a `velocity` that is not three finite numbers.
 */
export function rigidBodyParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const problems = specProblems(RigidBody, objectRecord(props), [])
  return toFindings(problems, { code: 'invalid-rigid-body-param', component: 'RigidBody', file, ref })
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
