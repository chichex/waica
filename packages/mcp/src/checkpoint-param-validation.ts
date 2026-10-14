import { Checkpoint } from '@waica/behaviors'
import { objectRecord } from './component-metadata.js'
import { specProblems, toFindings } from './physics-param-validation.js'
import type { ValidationFinding } from './validation-context.js'

/**
 * The authored Checkpoint params the respawn cannot use: a `spawnOffset`
 * that is not the three finite numbers `Checkpoint.params` declares (a short
 * array would leave an axis at 0, a string would respawn the player at NaN).
 */
export function checkpointParamFindings(props: unknown, file: string, ref: string): ValidationFinding[] {
  const problems = specProblems(Checkpoint, objectRecord(props), [])
  return toFindings(problems, { code: 'invalid-checkpoint-param', component: 'Checkpoint', file, ref })
}
