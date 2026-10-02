import { collisionBody } from './collision-body.js'
import {
  collisionBounds,
  type CollisionBody,
  type CollisionBounds,
} from './collision-shape.js'
import { Hitbox } from './components/hitbox.js'
import { Solid } from './components/solid.js'
import { Tilemap } from './components/tilemap.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import { sceneSolids } from './scene-solids.js'
import { forEachCandidatePair, type PairGrid } from './spatial-pairs.js'
import { usableCollisionBody } from './spatial-query-geometry.js'

const CELL_OCCUPANCY_CAP = 256

interface CellRange {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

export interface SpatialBroadphaseSource<T> {
  readonly value: T
  readonly order: number
  readonly body: CollisionBody
}

export interface SpatialBroadphaseStats {
  readonly indexed: number
  readonly overflow: number
}

export interface SpatialBroadphase<T> {
  readonly stats: SpatialBroadphaseStats
  candidates(bounds: CollisionBounds): T[]
  pairs(): Array<readonly [T, T]>
  /**
   * Visits the same pairs as `pairs()`, in the same order, without building
   * the list. The grid is frozen at creation, so callbacks that move, spawn
   * or destroy entities do not change which pairs are visited.
   */
  forEachPair(visit: (first: T, second: T) => void): void
}

interface SpatialEntry<T> extends SpatialBroadphaseSource<T> {
  readonly serial: number
  readonly range: CellRange | null
}

function rangeSize(range: CellRange): number | null {
  const width = range.maxX - range.minX + 1
  const height = range.maxY - range.minY + 1
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > CELL_OCCUPANCY_CAP ||
    height > CELL_OCCUPANCY_CAP ||
    width * height > CELL_OCCUPANCY_CAP
  ) {
    return null
  }
  return width * height
}

function cellRange(bounds: CollisionBounds, cellSize: number): CellRange | null {
  const left = Math.min(bounds.left, bounds.right)
  const right = Math.max(bounds.left, bounds.right)
  const bottom = Math.min(bounds.bottom, bounds.top)
  const top = Math.max(bounds.bottom, bounds.top)
  if (![left, right, bottom, top, cellSize].every(Number.isFinite) || cellSize <= 0) {
    return null
  }
  const range = {
    minX: Math.floor(left / cellSize),
    maxX: Math.floor(right / cellSize),
    minY: Math.floor(bottom / cellSize),
    maxY: Math.floor(top / cellSize),
  }
  if (!Object.values(range).every(Number.isSafeInteger)) return null
  return rangeSize(range) === null ? null : range
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`
}

function eachCell(range: CellRange, visit: (key: string) => void): void {
  for (let x = range.minX; x <= range.maxX; x += 1) {
    for (let y = range.minY; y <= range.maxY; y += 1) visit(cellKey(x, y))
  }
}

/** The value of the indexed entry at `index`; buckets and overflow only hold indices into `entries`. */
function entryValue<T>(entries: readonly SpatialEntry<T>[], index: number): T {
  const entry = entries[index]
  if (!entry) throw new Error(`Spatial broadphase has no entry at index ${index}`)
  return entry.value
}

/** Entry indices per occupied grid cell, plus the entries too large to bucket. */
interface SpatialGrid extends PairGrid {
  readonly buckets: Map<string, number[]>
  readonly overflow: number[]
  readonly entryBuckets: number[][][]
}

/** The indexable sources in query order, each with the cell range it covers. */
function spatialEntries<T>(
  sources: readonly SpatialBroadphaseSource<T>[],
  cellSize: number,
  isIndexable: (body: CollisionBody) => boolean,
): SpatialEntry<T>[] {
  return sources
    .map((source, serial): SpatialEntry<T> | null => {
      if (!isIndexable(source.body)) return null
      return {
        ...source,
        serial,
        range: cellRange(collisionBounds(source.body), cellSize),
      }
    })
    .filter((entry): entry is SpatialEntry<T> => entry !== null)
    .sort((a, b) => a.order - b.order || a.serial - b.serial)
}

function spatialGrid<T>(entries: readonly SpatialEntry<T>[]): SpatialGrid {
  const buckets = new Map<string, number[]>()
  const overflow: number[] = []
  const entryBuckets: number[][][] = []
  for (const [index, entry] of entries.entries()) {
    const own: number[][] = []
    entryBuckets.push(own)
    if (!entry.range) {
      overflow.push(index)
      continue
    }
    eachCell(entry.range, (key) => {
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = []
        buckets.set(key, bucket)
      }
      bucket.push(index)
      own.push(bucket)
    })
  }
  return { buckets, overflow, entryBuckets }
}

/**
 * Package-internal fresh uniform grid. Bodies above the fixed occupancy cap
 * remain in an overflow bucket and are conservatively visible everywhere.
 */
export function createSpatialBroadphase<T>(
  sources: readonly SpatialBroadphaseSource<T>[],
  cellSize: number,
  isIndexable: (body: CollisionBody) => boolean = usableCollisionBody,
): SpatialBroadphase<T> {
  const entries = spatialEntries(sources, cellSize, isIndexable)
  const grid = spatialGrid(entries)
  const { buckets, overflow } = grid
  const forEachPair = (visit: (first: T, second: T) => void): void => {
    forEachCandidatePair(grid, entries.length, (first, second) => {
      visit(entryValue(entries, first), entryValue(entries, second))
    })
  }

  return {
    stats: { indexed: entries.length - overflow.length, overflow: overflow.length },
    candidates(bounds) {
      const range = cellRange(bounds, cellSize)
      if (!range) return entries.map((entry) => entry.value)
      const selected = new Set<number>(overflow)
      eachCell(range, (key) => {
        for (const index of buckets.get(key) ?? []) selected.add(index)
      })
      return [...selected]
        .sort((a, b) => a - b)
        .map((index) => entryValue(entries, index))
    },
    pairs() {
      const result: Array<readonly [T, T]> = []
      forEachPair((first, second) => result.push([first, second]))
      return result
    },
    forEachPair,
  }
}

/** Smallest current live Tilemap cell, or one logical unit. */
export function broadphaseCellSize(game: Game): number {
  let result = Infinity
  for (const entity of [...game.entities]) {
    if (!entity.alive) continue
    const size = entity.get(Tilemap)?.cellSize
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
      result = Math.min(result, size)
    }
  }
  return result === Infinity ? 1 : result
}

export interface HitboxBroadphaseCandidate {
  readonly entity: Entity
  readonly hitbox: Hitbox
  readonly entityIndex: number
}

export interface SolidBroadphaseCandidate {
  readonly entity: Entity
  readonly solid: Solid
  readonly sourceIndex: number
}

export function createHitboxBroadphase(
  game: Game,
): SpatialBroadphase<HitboxBroadphaseCandidate> {
  const sources: Array<SpatialBroadphaseSource<HitboxBroadphaseCandidate>> = []
  for (const [entityIndex, entity] of [...game.entities].entries()) {
    if (!entity.alive) continue
    const hitbox = entity.get(Hitbox)
    if (!hitbox) continue
    sources.push({
      value: { entity, hitbox, entityIndex },
      order: entityIndex,
      body: collisionBody(hitbox),
    })
  }
  return createSpatialBroadphase(sources, broadphaseCellSize(game))
}

function rayIndexableBody(body: CollisionBody): boolean {
  if (body.shape !== 'circle') return usableCollisionBody(body)
  return (
    Number.isFinite(body.x) &&
    Number.isFinite(body.y) &&
    Number.isFinite(body.width) &&
    Number.isFinite(body.height) &&
    body.width !== 0 &&
    body.height !== 0
  )
}

export function createSolidBroadphase(
  game: Game,
): SpatialBroadphase<SolidBroadphaseCandidate> {
  const sources: Array<SpatialBroadphaseSource<SolidBroadphaseCandidate>> = []
  for (const [sourceIndex, solid] of [...sceneSolids(game)].entries()) {
    if (!solid.entity.alive) continue
    sources.push({
      value: { entity: solid.entity, solid, sourceIndex },
      order: sourceIndex,
      body: collisionBody(solid),
    })
  }
  return createSpatialBroadphase(sources, broadphaseCellSize(game), rayIndexableBody)
}
