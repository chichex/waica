import { isJsonObject, objectRecord } from './component-metadata.js'
import { add, type ValidationContext } from './validation-context.js'

/** Where an Animator's props are checked: the file findings cite and the context they join. */
export interface AnimatorPropsScope {
  readonly file: string
  readonly context: ValidationContext
}

/** The names of an Animator's blends, whatever their shape (issue #205): each is a clip `play` accepts. */
export function blendNamesOf(props: Record<string, unknown>): string[] {
  return Object.keys(objectRecord(props.blends))
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** A blend's points as authored: an empty list when `points` is not an array. */
function pointsOf(blend: Record<string, unknown>): unknown[] {
  return Array.isArray(blend.points) ? blend.points : []
}

/**
 * `invalid-clip-fade`: a `clips[name].fade` that is negative or not a finite
 * number, which the runtime ignores for the global `fade`. Needs no glb.
 */
export function validateClipFades(props: Record<string, unknown>, { file, context }: AnimatorPropsScope): void {
  for (const [name, override] of Object.entries(objectRecord(props.clips))) {
    const record = objectRecord(override)
    if (!Object.hasOwn(record, 'fade') || (isFiniteNumber(record.fade) && record.fade >= 0)) continue
    add(context, 'error', 'invalid-clip-fade', `Animator clips.${name}.fade must be a number of seconds ≥ 0; the Animator's fade applies instead.`, file, `Animator.clips.${name}.fade`)
  }
}

/** What is wrong with a blend's shape, in words; empty when nothing is. */
function blendShapeProblems(blend: unknown): string[] {
  const record = objectRecord(blend)
  const points = pointsOf(record)
  const problems: string[] = []
  if (typeof record.param !== 'string' || record.param === '') problems.push('it names no param')
  if (points.length === 0) problems.push('it has no points')
  if (points.some((point) => typeof objectRecord(point).clip !== 'string')) problems.push('a point names no clip')
  if (points.some((point) => !isFiniteNumber(objectRecord(point).at))) problems.push('a point\'s "at" is not a finite number')
  if (Object.hasOwn(record, 'smoothing') && !(isFiniteNumber(record.smoothing) && record.smoothing >= 0)) problems.push('its smoothing is not a number of seconds ≥ 0')
  return problems
}

/** A blend's finite thresholds, in the order its points are written. */
function writtenThresholds(blend: unknown): number[] {
  return pointsOf(objectRecord(blend)).map((point) => objectRecord(point).at).filter(isFiniteNumber)
}

/** A threshold two points share once sorted by "at", as the runtime sorts them; undefined when every one is distinct. */
function repeatedThreshold(thresholds: readonly number[]): number | undefined {
  const sorted = [...thresholds].sort((a, b) => a - b)
  return sorted.find((at, index) => index > 0 && at === sorted[index - 1])
}

/** Whether some point is written after one with a higher threshold. */
function writtenOutOfOrder(thresholds: readonly number[]): boolean {
  return thresholds.some((at, index) => index > 0 && at < (thresholds[index - 1] ?? at))
}

/**
 * A blend's shape, which needs no glb: `invalid-blend` for a `blends` that is
 * not an object of blends by name (a list, a string), and for a blend with no
 * param, no points, a point without a clip, an `at` that is not finite or a
 * `smoothing` that is negative or not finite. Thresholds are read as the
 * runtime plays them, sorted by `at`: `blend-thresholds-not-increasing` (an
 * error) for two points at the same one, where the pose jumps from one clip to
 * the other, and the warning `blend-points-out-of-order` for points written out
 * of `at` order, which plays the same (issue #205 CA-13, user decision of
 * 2026-10-23).
 */
export function validateBlendShapes(props: Record<string, unknown>, { file, context }: AnimatorPropsScope): void {
  if (props.blends !== undefined && !isJsonObject(props.blends)) {
    add(context, 'error', 'invalid-blend', 'Animator blends must be an object of blends by name; none plays.', file, 'Animator.blends')
  }
  for (const [name, blend] of Object.entries(objectRecord(props.blends))) {
    const ref = `Animator.blends.${name}`
    const problems = blendShapeProblems(blend)
    if (problems.length > 0) add(context, 'error', 'invalid-blend', `Animator blend "${name}" is malformed: ${problems.join('; ')}.`, file, ref)
    const thresholds = writtenThresholds(blend)
    const repeated = repeatedThreshold(thresholds)
    if (repeated !== undefined) {
      add(context, 'error', 'blend-thresholds-not-increasing', `Animator blend "${name}" has two points at "at" ${repeated}; there the pose jumps from one clip to the other. Give each point its own threshold.`, file, ref)
    }
    if (writtenOutOfOrder(thresholds)) {
      add(context, 'warning', 'blend-points-out-of-order', `Animator blend "${name}" lists its points out of "at" order; the runtime sorts them by "at" and plays the same, but the file reads better in increasing order (the editor saves it so).`, file, ref)
    }
  }
}

/**
 * A blend's clips against the glb its Model names: `blend-name-collides-with-clip`
 * for a blend named like a clip of the file (the clip plays),
 * `blend-clip-override-ignored` for a `clips` entry on a blend that sets more
 * than its `fade` (the runtime reads only that), `missing-clip` for a point
 * whose clip the file lacks (another blend's name included: blends do not
 * nest), `blend-point-one-shot` for a point on a `loop: false` clip.
 */
export function validateBlendClips(props: Record<string, unknown>, glb: ReadonlySet<string>, scope: AnimatorPropsScope): void {
  const { file, context } = scope
  const overrides = objectRecord(props.clips)
  const blends = objectRecord(props.blends)
  for (const [name, blend] of Object.entries(blends)) {
    const ref = `Animator.blends.${name}`
    if (glb.has(name)) add(context, 'error', 'blend-name-collides-with-clip', `Animator blend "${name}" has the name of a clip of the glb; the clip plays and the blend never does.`, file, ref)
    else validateBlendOverride(name, objectRecord(overrides[name]), scope)
    for (const [index, point] of pointsOf(objectRecord(blend)).entries()) {
      const clip = objectRecord(point).clip
      if (typeof clip !== 'string') continue
      const nested = Object.hasOwn(blends, clip) ? ' (a blend; blends do not nest)' : ''
      if (!glb.has(clip)) add(context, 'error', 'missing-clip', `Animator blend "${name}" point ${index} names missing animation clip "${clip}"${nested}.`, file, `${ref}.points.${index}.clip`)
      else if (objectRecord(overrides[clip]).loop === false) {
        add(context, 'warning', 'blend-point-one-shot', `Animator blend "${name}" point ${index} plays "${clip}", a loop: false clip; inside a blend it cycles anyway.`, file, `${ref}.points.${index}.clip`)
      }
    }
  }
}

/** `blend-clip-override-ignored`: a blend's `clips` entry sets more than the `fade` the runtime reads from it. */
function validateBlendOverride(name: string, override: Record<string, unknown>, { file, context }: AnimatorPropsScope): void {
  const ignored = Object.keys(override).filter((key) => key !== 'fade')
  if (ignored.length === 0) return
  const keys = ignored.join(' and ')
  add(context, 'warning', 'blend-clip-override-ignored', `Animator clips.${name} is a blend: only its fade applies, so ${keys} ${ignored.length > 1 ? 'are' : 'is'} ignored (a blend plays each point at its own clip's speed).`, file, `Animator.clips.${name}`)
}
