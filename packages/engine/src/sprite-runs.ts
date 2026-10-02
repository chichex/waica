/** One transparent renderable of a frame, with the fields three sorts it by. */
export interface Drawable<K> {
  /** The sprite's batch key; null for any other renderable (particles, tilemaps, meshes). */
  key: K | null
  /** The renderOrder of the nearest ancestor Group (three's `groupOrder`). */
  groupOrder: number
  renderOrder: number
  /** Clip-space z of the sort point, as three computes it: higher is farther. */
  z: number
  /** Object3D id: three's last tie-break, so creation order. */
  id: number
}

/** A Sprite Batch run, or a renderable drawn on its own between runs. */
export type DrawStep<K, T extends Drawable<K>> =
  | { kind: 'run'; key: K; groupOrder: number; items: T[] }
  | { kind: 'other'; item: T }

/** three's `reversePainterSortStable`: the order it draws transparent objects in. */
export function compareTransparentDraws<K>(a: Drawable<K>, b: Drawable<K>): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  if (a.z !== b.z) return b.z - a.z
  return a.id - b.id
}

/** What forEachSpriteRun reports, in draw order. */
export interface SpriteRunVisitor<K, T extends Drawable<K>> {
  /** A run: the drawables `start` (inclusive) to `end` (exclusive) share `key` and one group order. */
  run(key: K, start: number, end: number): void
  other(item: T): void
}

/**
 * Walks drawables already in draw order and reports each maximal sequence of
 * consecutive same-key sprites under one group order as a run. A sprite of
 * another key, any other renderable, or a change of group order ends the
 * run — so batching never changes what is drawn in front of what (ADR 0024).
 * Allocates nothing: the frame pass calls it every rendered frame.
 */
export function forEachSpriteRun<K, T extends Drawable<K>>(ordered: readonly T[], visitor: SpriteRunVisitor<K, T>): void {
  let start = 0
  while (start < ordered.length) {
    const first = ordered[start]
    if (!first) return
    const key = first.key
    if (key === null) {
      visitor.other(first)
      start += 1
      continue
    }
    let end = start + 1
    while (end < ordered.length && ordered[end]?.key === key && ordered[end]?.groupOrder === first.groupOrder) end += 1
    visitor.run(key, start, end)
    start = end
  }
}

/** Orders a frame's drawables exactly as three would draw them, then groups them into runs. */
export function buildSpriteRuns<K, T extends Drawable<K>>(drawables: readonly T[]): DrawStep<K, T>[] {
  const ordered = [...drawables].sort(compareTransparentDraws)
  const steps: DrawStep<K, T>[] = []
  forEachSpriteRun<K, T>(ordered, {
    run: (key, start, end) => {
      const items = ordered.slice(start, end)
      steps.push({ kind: 'run', key, groupOrder: items[0]?.groupOrder ?? 0, items })
    },
    other: (item) => steps.push({ kind: 'other', item }),
  })
  return steps
}
