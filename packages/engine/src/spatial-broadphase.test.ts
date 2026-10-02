import { describe, expect, it } from 'vitest'
import type { CollisionBounds } from './collision-shape.js'
import { dispatchCollisions } from './collision-dispatch.js'
import { Hitbox } from './components/hitbox.js'
import { Solid } from './components/solid.js'
import { Tilemap } from './components/tilemap.js'
import { Entity } from './entity.js'
import type { Game } from './game.js'
import { GameTime } from './game-time.js'
import {
  broadphaseCellSize,
  createSpatialBroadphase,
  type SpatialBroadphase,
} from './spatial-broadphase.js'
import {
  createSpatialQuery,
  type SpatialQueryInstrumentation,
} from './spatial-query.js'

interface World {
  readonly game: Game
  spawn(name: string, x?: number, y?: number): Entity
}

function makeWorld(instrumentation?: SpatialQueryInstrumentation): World {
  const entities: Entity[] = []
  const game = {
    entities,
    projection: null,
    applyParamOverrides: () => {},
    time: new GameTime(),
    removeEntity(entity: Entity) {
      const index = entities.indexOf(entity)
      if (index >= 0) entities.splice(index, 1)
    },
  } as unknown as Game
  Object.defineProperty(game, 'query', {
    value: createSpatialQuery(game, undefined, instrumentation),
  })
  return {
    game,
    spawn(name, x = 0, y = 0) {
      const entity = new Entity(game, name)
      entity.position.set(x, y, 0)
      entities.push(entity)
      return entity
    },
  }
}

/** Every pair a broadphase visits, in visit order. */
function pairsOf<T>(broadphase: SpatialBroadphase<T>): Array<readonly [T, T]> {
  const pairs: Array<readonly [T, T]> = []
  broadphase.forEachPair((first, second) => pairs.push([first, second]))
  return pairs
}

const LOCAL_BOUNDS: CollisionBounds = {
  left: 0,
  right: 1,
  bottom: 0,
  top: 1,
}

describe('package-internal uniform grid', () => {
  it('indexes exactly-at-cap bodies and overflows cap + 1 bodies without losing comparisons', () => {
    const atCap = createSpatialBroadphase([
      {
        value: 'at-cap',
        order: 0,
        body: { x: 127.5, y: 0.25, width: 255, height: 0.5 },
      },
      {
        value: 'local',
        order: 1,
        body: { x: 0.25, y: 0.25, width: 0.25, height: 0.25 },
      },
    ], 1)
    expect(atCap.stats).toEqual({ indexed: 2, overflow: 0 })
    expect(atCap.candidates(LOCAL_BOUNDS)).toEqual(['at-cap', 'local'])

    const aboveCap = createSpatialBroadphase([
      {
        value: 'overflow-a',
        order: 0,
        body: { x: 128, y: 0.25, width: 256, height: 0.5 },
      },
      {
        value: 'overflow-b',
        order: 1,
        body: { x: 1_128, y: 0.25, width: 256, height: 0.5 },
      },
      {
        value: 'local-normal',
        order: 2,
        body: { x: 0.25, y: 0.25, width: 0.25, height: 0.25 },
      },
      {
        value: 'remote-normal',
        order: 3,
        body: { x: 2_000.25, y: 0.25, width: 0.25, height: 0.25 },
      },
    ], 1)
    expect(aboveCap.stats).toEqual({ indexed: 2, overflow: 2 })
    expect(pairsOf(aboveCap)).toEqual([
      ['overflow-a', 'overflow-b'],
      ['overflow-a', 'local-normal'],
      ['overflow-a', 'remote-normal'],
      ['overflow-b', 'local-normal'],
      ['overflow-b', 'remote-normal'],
    ])
    expect(aboveCap.candidates(LOCAL_BOUNDS)).toEqual([
      'overflow-a',
      'overflow-b',
      'local-normal',
    ])
  })

  it('falls back to the complete ordered domain when a search spans above the cap', () => {
    const broadphase = createSpatialBroadphase([
      { value: 'first', order: 0, body: { x: -1_000, y: 0, width: 0.5, height: 0.5 } },
      { value: 'second', order: 1, body: { x: 1_000, y: 0, width: 0.5, height: 0.5 } },
    ], 1)

    expect(broadphase.candidates({ left: 0, right: 256, bottom: 0, top: 0 })).toEqual([
      'first',
      'second',
    ])
  })

  it('uses fallback 1 or the smallest finite positive live Tilemap cell size', () => {
    const world = makeWorld()
    expect(broadphaseCellSize(world.game)).toBe(1)

    for (const [name, size] of [
      ['large', 2],
      ['small', 0.25],
      ['zero', 0],
      ['negative', -1],
      ['non-finite', Number.NaN],
    ] as const) {
      world.spawn(name).add(Tilemap, { cellSize: size })
    }

    expect(broadphaseCellSize(world.game)).toBe(0.25)
    world.game.entities.find((entity) => entity.name === 'small')?.destroy()
    expect(broadphaseCellSize(world.game)).toBe(2)
  })
})

/** Cell range of a body as the grid buckets it, or null when it overflows the 256-cell cap. */
function referenceRange(body: { x: number; y: number; width: number; height: number }) {
  const minX = Math.floor(body.x - body.width / 2)
  const maxX = Math.floor(body.x + body.width / 2)
  const minY = Math.floor(body.y - body.height / 2)
  const maxY = Math.floor(body.y + body.height / 2)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  return w > 256 || h > 256 || w * h > 256 ? null : { minX, maxX, minY, maxY }
}

describe('candidate pairs', () => {
  it('lists every pair that shares a cell or involves an overflow body, once, in ascending query order', () => {
    // Deterministic layout: dense clusters, multi-cell bodies, two overflow
    // bodies, and query orders that differ from insertion order.
    let seed = 7
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    const sources = Array.from({ length: 300 }, (_, index) => {
      const overflow = index === 40 || index === 211
      const size = overflow ? 300 : random() < 0.2 ? 1 + random() * 2.5 : 0.1 + random() * 0.3
      return {
        value: index,
        order: (index * 37) % 300,
        body: { x: random() * 12 - 6, y: random() * 8 - 4, width: size, height: overflow ? 0.5 : size },
      }
    })
    const ordered = [...sources].sort((a, b) => a.order - b.order)
    const expected: Array<readonly [number, number]> = []
    for (const [i, left] of ordered.entries()) {
      for (const right of ordered.slice(i + 1)) {
        const a = referenceRange(left.body)
        const b = referenceRange(right.body)
        const share = !a || !b || (a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY)
        if (share) expected.push([left.value, right.value])
      }
    }

    const broadphase = createSpatialBroadphase(sources, 1)

    expect(broadphase.stats.overflow).toBe(2)
    expect(expected.length).toBeGreaterThan(1_000)
    expect(pairsOf(broadphase)).toEqual(expected)
  })
})

describe('fresh indexed query domains', () => {
  it('inspects one local Hitbox out of 1,000 and remains mask-agnostic', () => {
    const observations: Array<{ domain: string; count: number }> = []
    const world = makeWorld({
      onCandidates(domain, count) {
        observations.push({ domain, count })
      },
    })
    let target: Entity | undefined
    for (let index = 0; index < 1_000; index += 1) {
      const entity = world.spawn(`Hitbox ${index}`, index * 3 + 0.25, 0.25)
      entity.add(Hitbox, {
        width: 0.2,
        height: 0.2,
        layer: index === 0 ? 'INVALID' : 'enemy',
        collidesWith: [],
      })
      if (index === 0) target = entity
    }

    expect(world.game.query.area({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).toEqual([
      target,
    ])
    expect(world.game.query.point(0.25, 0.25)).toEqual([target])
    expect(observations).toEqual([
      { domain: 'hitbox', count: 1 },
      { domain: 'hitbox', count: 1 },
    ])
  })

  it('inspects one local Solid out of 1,000 and never crosses into the Hitbox domain', () => {
    const observations: Array<{ domain: string; count: number }> = []
    const world = makeWorld({
      onCandidates(domain, count) {
        observations.push({ domain, count })
      },
    })
    let localSolid: Solid | undefined
    for (let index = 0; index < 1_000; index += 1) {
      const x = index * 3 + 0.25
      world.spawn(`Unrelated Hitbox ${index}`, x, 10).add(Hitbox)
      const solid = world.spawn(`Solid ${index}`, x, 0.25).add(Solid, {
        width: 0.2,
        height: 0.2,
      })
      if (index === 0) localSolid = solid
    }

    expect(world.game.query.ray(-0.5, 0.25, 1, 0, 1)?.solid).toBe(localSolid)
    expect(observations).toEqual([{ domain: 'solid', count: 1 }])
  })

  it('rebuilds each call from current bodies, Tilemap size, and derived Solids', () => {
    const world = makeWorld()
    const target = world.spawn('Target', 0.25, 0.25)
    const hitbox = target.add(Hitbox, { width: 0.2, height: 0.2 })

    expect(world.game.query.point(0.25, 0.25)).toEqual([target])
    target.position.x = 3.25
    expect(world.game.query.point(0.25, 0.25)).toEqual([])
    expect(world.game.query.point(3.25, 0.25)).toEqual([target])
    hitbox.width = 0
    expect(world.game.query.point(3.25, 0.25)).toEqual([])

    const map = world.spawn('Map')
    const tilemap = map.add(Tilemap, {
      mapWidth: 1,
      mapHeight: 1,
      cellSize: 1,
      cells: [1],
      solidTiles: [1],
    })
    const first = world.game.query.ray(-1, 0.5, 1, 0, 3)?.solid
    tilemap.cellSize = 2
    const second = world.game.query.ray(-1, 1, 1, 0, 4)?.solid

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    expect(second?.width).toBe(2)
  })

  it('uses a full-domain fallback for oversized area and ray search regions', () => {
    const observations: Array<{ domain: string; count: number }> = []
    const world = makeWorld({
      onCandidates(domain, count) {
        observations.push({ domain, count })
      },
    })
    for (let index = 0; index < 3; index += 1) {
      world.spawn(`Hitbox ${index}`, index * 100, 0).add(Hitbox)
      world.spawn(`Solid ${index}`, index * 100, 0).add(Solid)
    }

    expect(world.game.query.area({ x: 100, y: 0, width: 400, height: 2 })).toHaveLength(3)
    expect(world.game.query.ray(-1, 0, 1, 0, 300)).not.toBeNull()
    expect(observations).toEqual([
      { domain: 'hitbox', count: 3 },
      { domain: 'solid', count: 3 },
    ])
  })
})
