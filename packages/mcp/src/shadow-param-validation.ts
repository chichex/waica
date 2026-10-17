import { shadowComponentIssues } from '@waica/engine'
import type { ValidationFinding } from './validation-context.js'

/** Authored values stay intact: report shadow normalization at every project-data boundary. */
export function shadowParamFindings(
  type: string,
  props: unknown,
  where: { file: string; ref: string },
): ValidationFinding[] {
  return shadowComponentIssues(type, props).map((issue) => ({
    severity: 'error',
    code: 'invalid-shadow-param',
    message: `${type} "${where.ref}": ${issue.message}`,
    file: where.file,
    ref: where.ref,
  }))
}
