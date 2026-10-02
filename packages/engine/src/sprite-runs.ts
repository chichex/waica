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
  | { kind: 'run'; key: K; items: T[] }
  | { kind: 'other'; item: T }

/** three's `reversePainterSortStable`: the order it draws transparent objects in. */
export function compareTransparentDraws<K>(a: Drawable<K>, b: Drawable<K>): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  if (a.z !== b.z) return b.z - a.z
  return a.id - b.id
}

/**
 * Orders a frame's drawables exactly as three would draw them and groups
 * each maximal sequence of consecutive same-key sprites into one run. A
 * sprite of another key, or any other renderable, ends the run — so
 * batching never changes what is drawn in front of what (ADR 0024).
 */
export function buildSpriteRuns<K, T extends Drawable<K>>(drawables: readonly T[]): DrawStep<K, T>[] {
  const ordered = [...drawables].sort(compareTransparentDraws)
  const steps: DrawStep<K, T>[] = []
  let run: { kind: 'run'; key: K; items: T[] } | null = null
  for (const item of ordered) {
    const key = item.key
    if (key === null) {
      run = null
      steps.push({ kind: 'other', item })
    } else if (run && run.key === key) {
      run.items.push(item)
    } else {
      run = { kind: 'run', key, items: [item] }
      steps.push(run)
    }
  }
  return steps
}
