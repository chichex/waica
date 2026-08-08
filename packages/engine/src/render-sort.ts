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
 * Z per entry under y-sort. Each layer keeps its 0.01 band; within a band,
 * lower Y gets a higher z (renders in front), and exact Y ties keep input
 * order. Offsets stay strictly inside (layer, layer + 1) × 0.01, so a higher
 * layer beats any Y in a lower one.
 */
export function ySortZ(entries: readonly YSortEntry[]): number[] {
  const byLayer = new Map<number, number[]>()
  for (const [index, entry] of entries.entries()) {
    const group = byLayer.get(entry.layer)
    if (group) group.push(index)
    else byLayer.set(entry.layer, [index])
  }
  const z = new Array<number>(entries.length)
  for (const [layer, indices] of byLayer) {
    // Stable sort: back-to-front is descending Y, ties keep input order.
    const ordered = [...indices].sort((a, b) => entries[b]!.y - entries[a]!.y)
    const step = 0.01 / (ordered.length + 1)
    for (const [rank, index] of ordered.entries()) {
      z[index] = layer * 0.01 + (rank + 1) * step
    }
  }
  return z
}
