/** The grid shape the pair walk needs: which buckets each entry is in, and the overflow. */
export interface PairGrid {
  /** Entries too large to bucket, ascending; they pair with every other entry. */
  readonly overflow: readonly number[]
  /** Per entry, the ascending buckets it was added to (empty for overflow entries). */
  readonly entryBuckets: readonly (readonly (readonly number[])[])[]
}

type PairVisitor = (first: number, second: number) => void

/** One walk over a grid: the grid, the visitor and scratch reused across entries. */
interface PairWalk {
  readonly grid: PairGrid
  readonly visit: PairVisitor
  /** marked[index] === first once index was collected as a neighbour of `first`. */
  readonly marked: Int32Array
  readonly neighbours: number[]
}

const NO_INDICES: readonly number[] = []

/** The entry index stored at `position` of a bucket that is iterated within its bounds. */
function indexAt(bucket: readonly number[], position: number): number {
  const index = bucket[position]
  if (index === undefined) throw new Error(`Spatial broadphase bucket has no index at position ${position}`)
  return index
}

/** First position in an ascending bucket whose index is greater than `index`. */
function firstAfter(bucket: readonly number[], index: number): number {
  let low = 0
  let high = bucket.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (indexAt(bucket, middle) <= index) low = middle + 1
    else high = middle
  }
  return low
}

/** Calls `each` with every index of an ascending bucket greater than `first`. */
function eachLater(bucket: readonly number[], first: number, each: (second: number) => void): void {
  for (let position = firstAfter(bucket, first); position < bucket.length; position += 1) {
    each(indexAt(bucket, position))
  }
}

/** The later indices of `buckets`, deduplicated and ascending, in the walk's scratch list. */
function laterNeighbours(walk: PairWalk, buckets: readonly (readonly number[])[], first: number): readonly number[] {
  const { marked, neighbours } = walk
  neighbours.length = 0
  for (const bucket of buckets) {
    eachLater(bucket, first, (second) => {
      if (marked[second] === first) return
      marked[second] = first
      neighbours.push(second)
    })
  }
  return neighbours.sort((a, b) => a - b)
}

/** The pairs of bucketed entry `first` with every later entry sharing a cell or overflowing. */
function visitBucketedPairs(walk: PairWalk, first: number): void {
  const { grid, visit } = walk
  const own = grid.entryBuckets[first] ?? []
  const laterOverflow = grid.overflow.length === 0 ? NO_INDICES : grid.overflow.filter((index) => index > first)
  const [only] = own
  if (own.length === 1 && only && laterOverflow.length === 0) {
    eachLater(only, first, (second) => visit(first, second))
    return
  }
  for (const second of laterNeighbours(walk, [...own, laterOverflow], first)) visit(first, second)
}

/**
 * Visits every distinct index pair sharing a cell, or involving an overflow
 * entry, in ascending (first, second) order. Buckets fill in index order, so
 * each one is already ascending: a body in one cell, with no overflow after
 * it, needs no deduplication or sort. Equivalent to collecting all pairs,
 * deduplicating and sorting them, without allocating per pair.
 */
export function forEachCandidatePair(grid: PairGrid, entryCount: number, visit: PairVisitor): void {
  const isOverflow = new Uint8Array(entryCount)
  for (const index of grid.overflow) isOverflow[index] = 1
  const walk: PairWalk = { grid, visit, marked: new Int32Array(entryCount).fill(-1), neighbours: [] }
  for (let first = 0; first < entryCount; first += 1) {
    if (!isOverflow[first]) {
      visitBucketedPairs(walk, first)
      continue
    }
    for (let second = first + 1; second < entryCount; second += 1) visit(first, second)
  }
}
