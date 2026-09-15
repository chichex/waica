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

/**
 * Package-internal fresh uniform grid. Bodies above the fixed occupancy cap
 * remain in an overflow bucket and are conservatively visible everywhere.
 */
export function createSpatialBroadphase<T>(
  sources: readonly SpatialBroadphaseSource<T>[],
  cellSize: number,
): SpatialBroadphase<T> {
  const entries: SpatialEntry<T>[] = sources
    .map((source, serial): SpatialEntry<T> | null => {
      if (!usableCollisionBody(source.body)) return null
      return {
        ...source,
        serial,
        range: cellRange(collisionBounds(source.body), cellSize),
      }
    })
    .filter((entry): entry is SpatialEntry<T> => entry !== null)
    .sort((a, b) => a.order - b.order || a.serial - b.serial)
  const buckets = new Map<string, number[]>()
  const overflow: number[] = []
  for (const [index, entry] of entries.entries()) {
    if (!entry.range) {
      overflow.push(index)
      continue
    }
    eachCell(entry.range, (key) => {
      const bucket = buckets.get(key)
      if (bucket) bucket.push(index)
      else buckets.set(key, [index])
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
        .map((index) => entries[index]!.value)
    },
    pairs() {
      const pairKeys = new Set<number>()
      const width = entries.length
      const addPair = (left: number, right: number): void => {
        if (left === right) return
        const first = Math.min(left, right)
        const second = Math.max(left, right)
        pairKeys.add(first * width + second)
      }
      for (const bucket of buckets.values()) {
        for (let left = 0; left < bucket.length; left += 1) {
          for (let right = left + 1; right < bucket.length; right += 1) {
            addPair(bucket[left]!, bucket[right]!)
          }
        }
      }
      for (const overflowIndex of overflow) {
        for (let index = 0; index < entries.length; index += 1) {
          addPair(overflowIndex, index)
        }
      }
      return [...pairKeys]
        .map((key): readonly [number, number] => [Math.floor(key / width), key % width])
        .sort(([a1, a2], [b1, b2]) => a1 - b1 || a2 - b2)
        .map(([first, second]) => [
          entries[first]!.value,
          entries[second]!.value,
        ] as const)
    },
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
  return createSpatialBroadphase(sources, broadphaseCellSize(game))
}
