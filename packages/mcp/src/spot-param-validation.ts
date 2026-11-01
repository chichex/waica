import { objectRecord } from './component-metadata.js'
import type { ValidationFinding } from './validation-context.js'

// Numbers print as written: JSON.stringify would show NaN and the infinities as null.
const shown = (value: unknown): string => (typeof value === 'number' ? String(value) : JSON.stringify(value) ?? String(value))

const isFiniteIn = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Whether `value` is three finite numbers that are not all zero: a vector a light can shine along. */
function isAimable(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
    value.some((part) => part !== 0)
  )
}

/** Each authored prop the engine would not take as written, with the rule it breaks. */
const RULES: { name: string; accepts: (value: unknown) => boolean; rule: string }[] = [
  { name: 'direction', accepts: isAimable, rule: 'three finite numbers, not all zero' },
  { name: 'angle', accepts: (value) => isFiniteIn(value, 1, 89), rule: 'a finite number of degrees from 1 to 89' },
  { name: 'penumbra', accepts: (value) => isFiniteIn(value, 0, 1), rule: 'a finite number from 0 to 1' },
]

/**
 * A SpotLight's authored `direction`, `angle` or `penumbra` that the engine
 * would not take as written (issue #204 CA-3): a direction that cannot aim
 * it keeps the last good one, an angle outside 1..89 degrees or a penumbra
 * outside 0..1 is clamped, and an unreadable number is ignored — all
 * silently, so the file would claim one cone and the game show another;
 * validate_project says so.
 */
export function spotParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const record = objectRecord(props)
  return RULES.filter(({ name, accepts }) => name in record && !accepts(record[name])).map(({ name, rule }) => ({
    severity: 'error',
    code: 'invalid-spot-param',
    message: `SpotLight "${ref}": ${name} must be ${rule}; got ${shown(record[name])}.`,
    file,
    ref,
  }))
}
