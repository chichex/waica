import { Light, type ParamSpec } from '@waica/engine'
import type { ValidationFinding } from './validation-context.js'

/** Light params whose value must be a whole number. */
const INTEGER_PARAMS = new Set(['bands'])

const shown = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value))

/** Whether `value` is a finite number inside the range, whole when `integer`. */
function fitsRange(value: unknown, range: { min: number; max?: number }, integer: boolean): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min) return false
  return (range.max === undefined || value <= range.max) && (!integer || Number.isInteger(value))
}

/** Why `value` breaks the param's declared range, or null when it fits. */
function rangeProblem(name: string, value: unknown): string | null {
  const params: Readonly<Record<string, ParamSpec>> = Light.params
  const spec = Object.hasOwn(params, name) ? params[name] : undefined
  if (spec?.min === undefined) return null
  const integer = INTEGER_PARAMS.has(name)
  if (fitsRange(value, { min: spec.min, max: spec.max }, integer)) return null
  if (spec.max === undefined) return `${name} must be at least ${spec.min}; got ${shown(value)}.`
  return `${name} must be ${integer ? 'an integer' : 'a number'} from ${spec.min} to ${spec.max}; got ${shown(value)}.`
}

/**
 * A Light's authored params outside the ranges its inspector declares
 * (inference 12: radius and intensity ≥ 0, bands an integer 0..16, softness
 * 0..1). The engine clamps them at runtime; validate_project says so.
 */
export function lightParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return []
  return Object.entries(props).flatMap(([name, value]) => {
    const problem = rangeProblem(name, value)
    return problem
      ? [{ severity: 'error' as const, code: 'invalid-light-param' as const, message: `Light "${ref}": ${problem}`, file, ref }]
      : []
  })
}
