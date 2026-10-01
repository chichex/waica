import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { isJsonObject, objectRecord } from './component-metadata.js'

/**
 * Runtime tool arguments checked against the tool's own published input
 * schema (CA-32): allowed properties, types, bounds, required fields and the
 * per-operation `oneOf` branches all come from `TOOLS`, so the contract a host
 * reads and the one the server enforces cannot drift apart. The tables below
 * only add what a JSON schema keyword cannot carry — a cross-field limit and
 * the wording of a few messages hosts already rely on.
 */

/** Rejects the call with the tool's stable runtime error; never returns. */
export type RejectRuntimeArguments = (message: string) => never

type Schema = Record<string, unknown>

interface CheckedCall {
  readonly args: Schema
  readonly reject: RejectRuntimeArguments
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const PROJECT_PATH_FIELD = 'project_path'

const VIEWPORT_PIXEL_BUDGET = 1_000_000

/** Object fields with a cross-field limit; the message covers any shape failure too. */
const OBJECT_REFINEMENTS: Record<string, { accepts: (value: Schema) => boolean; message: string }> = {
  viewport: {
    accepts: (viewport) => Number(viewport.width) * Number(viewport.height) <= VIEWPORT_PIXEL_BUDGET,
    message:
      'viewport width and height must be positive integers totaling at most ' +
      `${NUMBER_FORMAT.format(VIEWPORT_PIXEL_BUDGET)} pixels.`,
  },
}

/** Nouns a required-field message uses instead of the bare field name. */
const REQUIRED_FIELD_NOUNS: Record<string, string> = { scene: 'scene name' }

/**
 * Operations whose forbidden fields are reported group by group, in order.
 * Ignored unless the groups name exactly the fields the schema forbids.
 */
const FORBIDDEN_FIELD_GROUPS: Record<string, readonly (readonly string[])[]> = {
  step: [['action'], ['x', 'y', 'scene'], ['value']],
  // `value` belongs to hold alone (issue #75); it is reported on its own so the
  // older messages for the other fields stay exactly as hosts know them.
  press: [['frames', 'x', 'y', 'scene'], ['value']],
  release: [['frames', 'x', 'y', 'scene'], ['value']],
  click: [['action', 'frames', 'scene'], ['value']],
  scene: [['action', 'frames', 'x', 'y'], ['value']],
}

// Named before the generic unexpected-properties check, but only for `step`:
// a pre-ADR-0014 caller stepping by dt is told what replaced it, not just that
// the key is unexpected. Every other operation never accepted dt either, so it
// falls through to the generic "unexpected properties" message instead.
const RETIRED_STEP_DT_MESSAGE =
  'dt is not accepted: step advances whole Simulation Steps of 1/60 s each; pass frames (1 through 600) instead.'

export function validateRuntimeArguments(
  tool: Tool,
  args: Record<string, unknown>,
  reject: RejectRuntimeArguments,
): void {
  const schema = objectRecord(tool.inputSchema)
  const call: CheckedCall = { args, reject }
  if (tool.name === 'control_runtime' && args.dt !== undefined && args.operation === 'step') {
    reject(RETIRED_STEP_DT_MESSAGE)
  }
  rejectUnexpectedProperties(schema, call)
  const branches = schemaList(schema.oneOf)
  if (branches.length > 0) validateOperation(schema, branches, call)
  else validatePresentFields(call, properties(schema), Object.keys(properties(schema)))
}

function rejectUnexpectedProperties(schema: Schema, call: CheckedCall): void {
  const declared = Object.keys(properties(schema))
  const extras = Object.keys(call.args).filter((key) => !declared.includes(key))
  if (extras.length > 0) call.reject(`Unexpected properties: ${extras.sort().join(', ')}.`)
}

/** Validates each listed field that is present, in the given order. */
function validatePresentFields(call: CheckedCall, fields: Schema, names: readonly string[]): void {
  for (const name of names) {
    const value = call.args[name]
    if (value === undefined) continue
    const problem = fieldProblem(name, value, objectRecord(fields[name]))
    if (problem !== undefined) call.reject(problem)
  }
}

function validateOperation(schema: Schema, branches: readonly Schema[], call: CheckedCall): void {
  const fields = properties(schema)
  const discriminant = Object.keys(properties(branches[0] ?? {}))[0] ?? 'operation'
  const operation = call.args[discriminant]
  const branch = branches.find((candidate) =>
    branchValues(properties(candidate)[discriminant]).includes(operation),
  )
  if (typeof operation !== 'string' || branch === undefined) {
    call.reject(`${discriminant} is not a supported runtime control operation.`)
  }
  const forbidden = forbiddenFields(branch)
  const required = stringList(branch.required)
  const optional = Object.keys(fields).filter(
    (name) => name !== PROJECT_PATH_FIELD && name !== discriminant,
  )
  rejectForbiddenFields(call, operation, { forbidden, optional })
  for (const name of required) {
    const fieldSchema = objectRecord(fields[name])
    if (!conforms(call.args[name], fieldSchema)) call.reject(requiredMessage(operation, name, fieldSchema))
  }
  const remaining = optional.filter((name) => !forbidden.includes(name) && !required.includes(name))
  validatePresentFields(call, fields, remaining)
}

function rejectForbiddenFields(
  call: CheckedCall,
  operation: string,
  fields: { forbidden: readonly string[]; optional: readonly string[] },
): void {
  const everyOptionalField = fields.optional.every((name) => fields.forbidden.includes(name))
  for (const group of forbiddenGroups(operation, fields.forbidden)) {
    if (!group.some((name) => call.args[name] !== undefined)) continue
    call.reject(
      everyOptionalField
        ? `${operation} accepts no additional fields.`
        : `${operation} does not accept ${humanList(group, 'or')}.`,
    )
  }
}

function forbiddenGroups(
  operation: string,
  forbidden: readonly string[],
): readonly (readonly string[])[] {
  const groups = FORBIDDEN_FIELD_GROUPS[operation]
  const grouped = groups?.flat() ?? []
  const matchesSchema =
    grouped.length === forbidden.length && grouped.every((name) => forbidden.includes(name))
  return groups !== undefined && matchesSchema ? groups : [forbidden]
}

/** Fields a `oneOf` branch forbids through `not: { anyOf: [{ required: [...] }] }`. */
function forbiddenFields(branch: Schema): string[] {
  return schemaList(objectRecord(branch.not).anyOf).flatMap((entry) => stringList(entry.required))
}

function requiredMessage(operation: string, name: string, schema: Schema): string {
  const noun = REQUIRED_FIELD_NOUNS[name] ?? name
  const qualifier = schema.type === 'number' ? 'finite' : 'nonempty'
  return `${operation} requires a ${qualifier} ${noun}.`
}

function fieldProblem(name: string, value: unknown, schema: Schema): string | undefined {
  if (schema.type === 'object') return objectProblem(name, value, schema)
  return conforms(value, schema) ? undefined : typeMessage(name, schema)
}

function objectProblem(name: string, value: unknown, schema: Schema): string | undefined {
  const shapeMessage = `${name} must contain ${humanList(stringList(schema.required), 'and')}.`
  if (!isJsonObject(value)) return shapeMessage
  const refinement = OBJECT_REFINEMENTS[name]
  const valid = conforms(value, schema) && (refinement?.accepts(value) ?? true)
  return valid ? undefined : (refinement?.message ?? shapeMessage)
}

/** Whether a value satisfies one JSON schema `type` and the bounds it declares. */
const TYPE_CHECKS: Record<string, (value: unknown, schema: Schema) => boolean> = {
  string: (value, schema) => typeof value === 'string' && value.length >= numberOr(schema.minLength, 0),
  boolean: (value) => typeof value === 'boolean',
  number: (value, schema) =>
    typeof value === 'number' && Number.isFinite(value) && withinBounds(value, schema),
  integer: (value, schema) =>
    typeof value === 'number' && Number.isInteger(value) && withinBounds(value, schema),
  array: (value, schema) =>
    Array.isArray(value) && value.every((entry) => conforms(entry, objectRecord(schema.items))),
  object: (value, schema) => isJsonObject(value) && objectConforms(value, schema),
}

function conforms(value: unknown, schema: Schema): boolean {
  const check = typeof schema.type === 'string' ? TYPE_CHECKS[schema.type] : undefined
  return check === undefined || check(value, schema)
}

function objectConforms(value: Schema, schema: Schema): boolean {
  const fields = properties(schema)
  const keys = Object.keys(value)
  const closed = schema.additionalProperties === false
  return (
    (!closed || keys.every((key) => key in fields)) &&
    stringList(schema.required).every((key) => value[key] !== undefined) &&
    keys.every((key) => conforms(value[key], objectRecord(fields[key])))
  )
}

function withinBounds(value: number, schema: Schema): boolean {
  return (
    value >= numberOr(schema.minimum, Number.NEGATIVE_INFINITY) &&
    value > numberOr(schema.exclusiveMinimum, Number.NEGATIVE_INFINITY) &&
    value <= numberOr(schema.maximum, Number.POSITIVE_INFINITY)
  )
}

function typeMessage(name: string, schema: Schema): string {
  switch (schema.type) {
    case 'string':
      return numberOr(schema.minLength, 0) > 0 ? `${name} must be a nonempty string.` : `${name} must be a string.`
    case 'boolean':
      return `${name} must be a boolean.`
    case 'integer':
      return `${name} must be an integer${rangeText(schema)}.`
    case 'number':
      return `${name} must be a finite number${rangeText(schema)}.`
    case 'array':
      return `${name} must be an array of ${String(objectRecord(schema.items).type)}s.`
    default:
      return `${name} is invalid.`
  }
}

function rangeText(schema: Schema): string {
  const { minimum, maximum, exclusiveMinimum } = schema
  const format = (bound: number): string => NUMBER_FORMAT.format(bound)
  if (typeof exclusiveMinimum === 'number' && typeof maximum === 'number') {
    return ` greater than ${format(exclusiveMinimum)} and at most ${format(maximum)}`
  }
  if (typeof minimum === 'number' && typeof maximum === 'number') {
    return ` from ${format(minimum)} through ${format(maximum)}`
  }
  if (typeof minimum === 'number') return ` of at least ${format(minimum)}`
  return typeof maximum === 'number' ? ` of at most ${format(maximum)}` : ''
}

function humanList(items: readonly string[], conjunction: 'and' | 'or'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1) ?? ''}`
}

/** The discriminant values a branch selects, from `enum` or `const`. */
function branchValues(schema: unknown): unknown[] {
  const record = objectRecord(schema)
  return Array.isArray(record.enum) ? record.enum : [record.const]
}

function properties(schema: Schema): Schema {
  return objectRecord(schema.properties)
}

function schemaList(value: unknown): Schema[] {
  return Array.isArray(value) ? value.map(objectRecord) : []
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}
