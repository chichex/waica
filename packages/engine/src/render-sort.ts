/**
 * Y-sort draw ordering: an opt-in render mode (scene JSON `render.sort: 'y'`)
 * for top-down scenes where "lower on screen" means "closer to the camera".
 */
export interface YSortEntry {
  /** The sprite's layer — the primary draw-order band, exactly as without y-sort. */
  layer: number
  /** The owning entity's world Y — the sort key. Sprite offsets don't shift it. */
  y: number
}

/**
 * The explicit seam a component opts into to participate in y-sort: it
 * exposes its draw-order layer and accepts the per-frame z the pass derives.
 * Both stock sprite classes implement it; a custom renderable can too.
 */
export interface YSortParticipant {
  readonly layer: number
  /** Y-sort pass hook: overrides the layer-derived z for this frame. */
  setSortZ(z: number): void
}

/** A single batched renderable that contributes one global y-sort entry per item. */
export interface YSortBatchParticipant extends YSortParticipant {
  ySortEntries(): readonly YSortEntry[]
  setSortZs(values: readonly number[]): void
}

export function isYSortParticipant(value: unknown): value is YSortParticipant {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as YSortParticipant).layer === 'number' &&
    typeof (value as YSortParticipant).setSortZ === 'function'
  )
}

export function isYSortBatchParticipant(value: unknown): value is YSortBatchParticipant {
  return (
    isYSortParticipant(value) &&
    typeof (value as YSortBatchParticipant).ySortEntries === 'function' &&
    typeof (value as YSortBatchParticipant).setSortZs === 'function'
  )
}

/** The Y of the entry at `index`, which `ySortZ` only reads for indices it grouped from `entries`. */
function entryY(entries: readonly YSortEntry[], index: number): number {
  const entry = entries[index]
  if (!entry) throw new Error(`ySortZ has no entry at index ${index}`)
  return entry.y
}

/**
 * Z per entry under y-sort. Each layer keeps its 0.01 band; within a band,
 * lower Y gets a higher z (renders in front), and exact Y ties keep input
 * order. Offsets stay strictly inside (layer, layer + 1) × 0.01 for integer
 * layers — but a fractional layer (e.g. 0.5) can sit closer than that to the
 * next one present, so each band is capped at the gap to the next distinct
 * layer above it, never wider than 0.01. Integer layers are always >= 1
 * apart, so their band is exactly the old fixed 0.01.
 */
export function ySortZ(entries: readonly YSortEntry[]): number[] {
  const byLayer = new Map<number, number[]>()
  for (const [index, entry] of entries.entries()) {
    const group = byLayer.get(entry.layer)
    if (group) group.push(index)
    else byLayer.set(entry.layer, [index])
  }
  const layers = [...byLayer].sort(([a], [b]) => a - b)
  const z = new Array<number>(entries.length)
  for (const [i, [layer, indices]] of layers.entries()) {
    const next = layers[i + 1]?.[0]
    const width = next === undefined ? 0.01 : Math.min(0.01, (next - layer) * 0.01)
    // Stable sort: back-to-front is descending Y, ties keep input order.
    const ordered = [...indices].sort((a, b) => entryY(entries, b) - entryY(entries, a))
    const step = width / (ordered.length + 1)
    for (const [rank, index] of ordered.entries()) {
      z[index] = layer * 0.01 + (rank + 1) * step
    }
  }
  return z
}
