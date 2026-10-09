import { objectRecord } from './component-metadata.js'
import type { ValidationFinding } from './validation-context.js'

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value)

/** Whether `value` is three finite numbers that are not all zero: a vector a light can shine along. */
function isAimable(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
    value.some((part) => part !== 0)
  )
}

/**
 * A Sun's authored `direction` that cannot aim it (issue #154 CA-11): not
 * three finite numbers, or all zero. The engine keeps the last good direction
 * (the default `[-1, -2, -1]`) and says nothing, so the file would claim one
 * light and the game show another; validate_project says so.
 */
export function sunParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const record = objectRecord(props)
  if (!('direction' in record) || isAimable(record.direction)) return []
  return [
    {
      severity: 'error',
      code: 'invalid-sun-param',
      message: `Sun "${ref}": direction must be three finite numbers, not all zero; got ${shown(record.direction)}.`,
      file,
      ref,
    },
  ]
}
