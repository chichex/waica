// Editing an Animator's `blends` (issue 205 CA-19) as the Inspector's Blends
// section does: every edit returns the whole record, its points ordered by
// threshold, keeping whatever else the JSON holds (a missing clip included).

/** A blend as stored: `param`, `points` and `smoothing` (AnimatorBlend), plus whatever else the JSON holds. */
export type StoredBlend = Record<string, unknown>
export type StoredBlends = Record<string, StoredBlend>
/** A point as stored: `clip` and `at`, plus whatever else the JSON holds. */
export type StoredPoint = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The blends an Animator's `blends` holds, each kept whole; anything that is not one is dropped. */
export function blendsOf(value: unknown): StoredBlends {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, StoredBlend] => isRecord(entry[1])))
}

/** A blend's points, each kept whole; anything that is not one is dropped. */
export function pointsOf(blend: StoredBlend): StoredPoint[] {
  return Array.isArray(blend.points) ? blend.points.filter(isRecord) : []
}

/** A point's threshold, NaN when it holds none. */
export const thresholdOf = (point: StoredPoint): number => (typeof point.at === 'number' ? point.at : Number.NaN)

/** The points in threshold order; a point without a number keeps its place after the others. */
export function sortedPoints(points: readonly StoredPoint[]): StoredPoint[] {
  const key = (point: StoredPoint): number => (Number.isFinite(thresholdOf(point)) ? thresholdOf(point) : Number.POSITIVE_INFINITY)
  return [...points].sort((a, b) => key(a) - key(b))
}

/** The blend with `points`, saved in threshold order. */
export function withPoints(blend: StoredBlend, points: readonly StoredPoint[]): StoredBlend {
  return { ...blend, points: sortedPoints(points) }
}

/** `blends` with `name` replaced by `blend`, in place. */
export function withBlend(blends: StoredBlends, name: string, blend: StoredBlend): StoredBlends {
  return { ...blends, [name]: blend }
}

/** `blends` without `name`. */
export function withoutBlend(blends: StoredBlends, name: string): StoredBlends {
  return Object.fromEntries(Object.entries(blends).filter(([key]) => key !== name))
}

/** `blends` with `from` renamed `to`, keeping its place among the others. */
export function renamedBlend(blends: StoredBlends, from: string, to: string): StoredBlends {
  return Object.fromEntries(Object.entries(blends).map(([key, blend]) => [key === from ? to : key, blend]))
}

/** A name no blend and no glb clip has: "Blend", then "Blend 2", "Blend 3"… */
export function nextBlendName(taken: readonly string[]): string {
  let index = 1
  const nameAt = (n: number): string => (n === 1 ? 'Blend' : `Blend ${n}`)
  while (taken.includes(nameAt(index))) index += 1
  return nameAt(index)
}

/** A new blend: on `speed`, with no points yet. */
export const NEW_BLEND: StoredBlend = { param: 'speed', points: [] }

/** A new point after the others: the first glb clip the blend does not use yet (else the first, else none), one past the last threshold. */
export function nextPoint(points: readonly StoredPoint[], clips: readonly string[] | null): StoredPoint {
  const used = new Set(points.map((point) => point.clip))
  const clip = clips?.find((name) => !used.has(name)) ?? clips?.[0] ?? ''
  const finite = points.map(thresholdOf).filter(Number.isFinite)
  return { clip, at: finite.length > 0 ? Math.max(...finite) + 1 : 0 }
}

/** The thresholds' range a preview slider covers, or null with fewer than two distinct ones. */
export function thresholdRange(points: readonly StoredPoint[]): { min: number; max: number } | null {
  const finite = points.map(thresholdOf).filter(Number.isFinite)
  if (finite.length === 0) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  return max > min ? { min, max } : null
}
