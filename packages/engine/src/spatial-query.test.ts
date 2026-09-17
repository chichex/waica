import { describe, expect, it } from 'vitest'
import type { CollisionBody } from './collision-shape'
import { Component } from './component'
import { Hitbox } from './components/hitbox'
import { Entity } from './entity'
import type { Game } from './game'
import { GameTime } from './game-time'
import {
  createSpatialQuery,
  type SpatialQueryCandidateProviders,
} from './spatial-query'

interface World {
  readonly game: Game
  spawn(name: string, x?: number, y?: number): Entity
}

function makeWorld(): World {
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
  Object.defineProperty(game, 'query', { value: createSpatialQuery(game) })
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

class Marker extends Component {}

describe('SpatialQuery.area', () => {
  it('returns overlapping Hitbox owners in game order and excludes edge-only contact', () => {
    const world = makeWorld()
    const first = world.spawn('First', 0.5, 0)
    first.add(Hitbox, { width: 1, height: 1 })
    world.spawn('No hitbox', 0, 0).add(Marker)
    const edgeOnly = world.spawn('Edge only', 1.5, 0)
    edgeOnly.add(Hitbox, { width: 1, height: 1 })
    const vertexOnly = world.spawn('Vertex only', 1.5, 1.5)
    vertexOnly.add(Hitbox, { width: 1, height: 1 })
    const second = world.spawn('Second', -0.75, 0)
    second.add(Hitbox, { width: 1, height: 1 })

    expect(world.game.query.area({ x: 0, y: 0, width: 2, height: 2 })).toEqual([
      first,
      second,
    ])
  })

  it('uses offsets, absolute dimensions, shape outlines, and logical projected positions', () => {
    const world = makeWorld()
    const offset = world.spawn('Offset', 5, 5)
    offset.add(Hitbox, { offsetX: -5, offsetY: -5, width: -1, height: -1 })
    const polygon = world.spawn('Polygon', 0.7, 0)
    polygon.add(Hitbox, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: [
        [-0.5, -0.5],
        [0.5, 0],
        [-0.5, 0.5],
      ],
    })
    const circle = world.spawn('Circle', 0, 1.2)
    circle.add(Hitbox, { shape: 'circle', width: 1, height: 1 })
    const projected = world.spawn('Projected', 0, 0)
    projected.add(Hitbox, { width: 0.25, height: 0.25 })
    projected.setProjected(true)
    projected.node.position.set(100, 100, 0)

    expect(world.game.query.area({ x: 0, y: 0, width: 1, height: 1 })).toEqual([
      offset,
      polygon,
      projected,
    ])
    expect(world.game.query.area({ x: 0, y: 1.2, width: 0.2, height: 0.2 })).toEqual([
      circle,
    ])
  })

  it('keeps rectangle and malformed-polygon fallbacks while rejecting zero-area geometry', () => {
    const world = makeWorld()
    const target = world.spawn('Target')
    target.add(Hitbox, { width: 0.25, height: 0.25 })
    const unknownShape = {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      shape: 'future-shape',
    } as unknown as CollisionBody
    const malformedPolygon = {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      shape: 'polygon',
      points: [[0, 0], ['bad', 1], [1, 0]],
    } as unknown as CollisionBody

    expect(world.game.query.area(unknownShape)).toEqual([target])
    expect(world.game.query.area(malformedPolygon)).toEqual([target])
    expect(
      world.game.query.area({
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        shape: 'polygon',
        points: [
          [-0.5, 0],
          [0, 0],
          [0.5, 0],
        ],
      }),
    ).toEqual([])
  })

  it('returns an empty snapshot for missing, non-finite, or zero-dimension input', () => {
    const world = makeWorld()
    world.spawn('Target').add(Hitbox)
    const invalid: unknown[] = [
      null,
      undefined,
      4,
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: Infinity, width: 1, height: 1 },
      { x: 0, y: 0, width: -Infinity, height: 1 },
      { x: 0, y: 0, width: 1, height: NaN },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0, y: 0, width: 1, height: 0 },
    ]

    for (const body of invalid) {
      expect(() => world.game.query.area(body as CollisionBody)).not.toThrow()
      expect(world.game.query.area(body as CollisionBody)).toEqual([])
    }
  })

  it('composes with, without, exclusion forms, and the final where predicate', () => {
    class Required extends Component {}
    class Forbidden extends Component {}
    const world = makeWorld()
    const first = world.spawn('First')
    first.add(Hitbox)
    first.add(Required)
    const forbidden = world.spawn('Forbidden')
    forbidden.add(Hitbox)
    forbidden.add(Required)
    forbidden.add(Forbidden)
    const last = world.spawn('Last')
    last.add(Hitbox)
    last.add(Required)
    const predicateRejected = world.spawn('Predicate rejected')
    predicateRejected.add(Hitbox)
    predicateRejected.add(Required)
    const body = { x: 0, y: 0, width: 10, height: 10 }

    expect(
      world.game.query.area(body, {
        with: [Required] as const,
        without: [Forbidden],
        exclude: last,
        where: (entity) => entity.name !== 'Predicate rejected',
      }),
    ).toEqual([first])
    expect(world.game.query.area(body, { with: [Required], without: [Required] })).toEqual([])
    expect(world.game.query.area(body, { exclude: first })).toEqual([
      forbidden,
      last,
      predicateRejected,
    ])
    expect(world.game.query.area(body, { exclude: Object.freeze([first, forbidden]) })).toEqual([
      last,
      predicateRejected,
    ])
    expect(world.game.query.area(body, { exclude: new Set([forbidden, last]) })).toEqual([
      first,
      predicateRejected,
    ])
    const backing = new Set([first, forbidden])
    const readonlyView: ReadonlySet<Entity> = {
      get size() {
        return backing.size
      },
      has: (entity) => backing.has(entity),
      entries: () => backing.entries(),
      keys: () => backing.keys(),
      values: () => backing.values(),
      forEach(callback, thisArg) {
        backing.forEach((entity) => callback.call(thisArg, entity, entity, readonlyView))
      },
      [Symbol.iterator]: () => backing[Symbol.iterator](),
    }
    expect(world.game.query.area(body, { exclude: readonlyView })).toEqual([
      last,
      predicateRejected,
    ])
  })

  it('returns eager arrays containing live references after later spawn, movement, and destruction', () => {
    const world = makeWorld()
    const first = world.spawn('First')
    const hitbox = first.add(Hitbox)

    const result = world.game.query.area({ x: 0, y: 0, width: 2, height: 2 })
    const later = world.spawn('Later')
    later.add(Hitbox)
    first.position.x = 9
    hitbox.width = 7
    first.destroy()

    expect(result).toEqual([first])
    expect(result).not.toContain(later)
    expect(result[0]!.alive).toBe(false)
    expect(result[0]!.position.x).toBe(9)
    expect(hitbox.width).toBe(7)
  })

  it('can replace the package-internal Hitbox candidate provider', () => {
    const world = makeWorld()
    const indexedOnly = new Entity(world.game, 'Indexed only')
    const hitbox = indexedOnly.add(Hitbox)
    const providers: SpatialQueryCandidateProviders = {
      hitboxes: () => [{ entity: indexedOnly, hitbox }],
      transforms: () => [],
      solids: () => [],
    }
    const query = createSpatialQuery(world.game, providers)

    expect(query.area({ x: 0, y: 0, width: 2, height: 2 })).toEqual([indexedOnly])
  })
})

describe('SpatialQuery.point', () => {
  it('includes strict rectangle interiors and excludes every edge and vertex', () => {
    const world = makeWorld()
    const rectangle = world.spawn('Rectangle')
    rectangle.add(Hitbox, { width: 2, height: 2 })

    expect(world.game.query.point(0.999, 0)).toEqual([rectangle])
    expect(world.game.query.point(1, 0)).toEqual([])
    expect(world.game.query.point(1, 1)).toEqual([])
  })

  it('uses exact polygon and polygonal-circle outlines with strict boundaries', () => {
    const world = makeWorld()
    const triangle = world.spawn('Triangle')
    triangle.add(Hitbox, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0, 0.5],
      ],
    })
    const circle = world.spawn('Circle', 4, 0)
    circle.add(Hitbox, { shape: 'circle', width: 2, height: 2 })

    expect(world.game.query.point(0, 0)).toEqual([triangle])
    expect(world.game.query.point(0, -1)).toEqual([])
    expect(world.game.query.point(0, 1)).toEqual([])
    expect(world.game.query.point(4.9, 0)).toEqual([circle])
    expect(world.game.query.point(5, 0)).toEqual([])
  })

  it('honors offsets, absolute dimensions, game order, filters, and logical positions', () => {
    class Required extends Component {}
    const world = makeWorld()
    const first = world.spawn('First', 10, 10)
    first.add(Hitbox, { offsetX: -10, offsetY: -10, width: -2, height: -2 })
    first.add(Required)
    const second = world.spawn('Second')
    second.add(Hitbox, { width: 2, height: 2 })
    second.add(Required)
    second.setProjected(true)
    second.node.position.set(50, 50, 0)

    expect(world.game.query.point(0, 0, { with: [Required] as const })).toEqual([
      first,
      second,
    ])
    expect(world.game.query.point(0, 0, { exclude: first })).toEqual([second])
  })

  it('falls back for malformed points and skips malformed or zero-area candidates', () => {
    const world = makeWorld()
    const fallback = world.spawn('Fallback')
    fallback.add(Hitbox, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: [[0, 0], ['bad', 1], [1, 0]] as unknown as Array<[number, number]>,
    })
    const nonFinite = world.spawn('Non-finite')
    nonFinite.add(Hitbox, { width: Number.NaN })
    const zero = world.spawn('Zero')
    zero.add(Hitbox, { width: 0 })
    const collinear = world.spawn('Collinear')
    collinear.add(Hitbox, {
      shape: 'polygon',
      points: [
        [-0.5, 0],
        [0, 0],
        [0.5, 0],
      ],
    })

    expect(world.game.query.point(0, 0)).toEqual([fallback])
  })

  it('returns an empty array without throwing for non-finite coordinates', () => {
    const world = makeWorld()
    world.spawn('Target').add(Hitbox)

    const coordinates: Array<readonly [number, number]> = [
      [Number.NaN, 0],
      [0, Infinity],
      [-Infinity, 0],
    ]
    for (const [x, y] of coordinates) {
      expect(() => world.game.query.point(x, y)).not.toThrow()
      expect(world.game.query.point(x, y)).toEqual([])
    }
  })
})

describe('SpatialQuery.nearest', () => {
  it('ranks every live transform by logical XY, without requiring geometry or using Z', () => {
    const world = makeWorld()
    const farther = world.spawn('Farther', 2, 0)
    farther.add(Hitbox)
    const nearest = world.spawn('Nearest', 1, 0)
    nearest.position.z = 10_000
    const dead = world.spawn('Dead', 0.1, 0)
    dead.destroy()

    expect(world.game.query.nearest(0, 0)).toBe(nearest)
    expect(world.game.query.nearest(0, 0)).not.toBe(farther)
  })

  it('retains an infinite Math.hypot result when the radius is unlimited', () => {
    const world = makeWorld()
    const extreme = world.spawn('Extreme', Number.MAX_VALUE, 0)
    let observedDistance = 0

    const result = world.game.query.nearest(-Number.MAX_VALUE, 0, {
      where: (_candidate, { distance }) => {
        observedDistance = distance
        return true
      },
    })

    expect(result).toBe(extreme)
    expect(observedDistance).toBe(Infinity)
  })

  it('keeps game order on equal distances', () => {
    const world = makeWorld()
    const first = world.spawn('First', -1, 0)
    world.spawn('Second', 1, 0)

    expect(world.game.query.nearest(0, 0)).toBe(first)
  })

  it('treats maxDistance as inclusive with the specified zero and unlimited cases', () => {
    const world = makeWorld()
    const origin = world.spawn('Origin', 0, 0)
    const atFive = world.spawn('At five', 3, 4)

    expect(world.game.query.nearest(3, 4)).toBe(atFive)
    expect(world.game.query.nearest(0, 0, { maxDistance: Infinity, exclude: origin })).toBe(atFive)
    expect(world.game.query.nearest(0, 0, { maxDistance: 5, exclude: origin })).toBe(atFive)
    expect(world.game.query.nearest(0, 0, { maxDistance: 4.999, exclude: origin })).toBeNull()
    expect(world.game.query.nearest(0, 0, { maxDistance: 0 })).toBe(origin)
    expect(world.game.query.nearest(0, 0, { maxDistance: 0, exclude: origin })).toBeNull()
  })

  it('returns null without invoking candidates for invalid coordinates or distance', () => {
    const world = makeWorld()
    world.spawn('Target')

    expect(world.game.query.nearest(Number.NaN, 0)).toBeNull()
    expect(world.game.query.nearest(0, Infinity)).toBeNull()
    expect(world.game.query.nearest(0, 0, { maxDistance: -0.001 })).toBeNull()
    expect(world.game.query.nearest(0, 0, { maxDistance: Number.NaN })).toBeNull()
    expect(world.game.query.nearest(0, 0, { maxDistance: -Infinity })).toBeNull()
  })

  it('passes the computed distance to contextual where before ranking', () => {
    class Radius extends Component {
      radius = 0
    }
    const world = makeWorld()
    const tooSmall = world.spawn('Too small', 1, 0)
    tooSmall.add(Radius, { radius: 0.5 })
    const inclusive = world.spawn('Inclusive', 0, 2)
    inclusive.add(Radius, { radius: 2 })
    const farther = world.spawn('Farther', 3, 0)
    farther.add(Radius, { radius: 10 })

    const result = world.game.query.nearest(0, 0, {
      with: [Radius] as const,
      where: (candidate, { distance }) => distance <= candidate.get(Radius).radius,
    })

    expect(result).toBe(inclusive)
  })

  it('composes shared filters and can replace the transform provider', () => {
    class Required extends Component {}
    class Forbidden extends Component {}
    const world = makeWorld()
    const inScene = world.spawn('In scene', 0.1, 0)
    inScene.add(Required)
    inScene.add(Forbidden)
    const indexedOnly = new Entity(world.game, 'Indexed only')
    indexedOnly.position.set(2, 0, 0)
    indexedOnly.add(Required)
    const providers: SpatialQueryCandidateProviders = {
      hitboxes: () => [],
      transforms: () => [indexedOnly],
      solids: () => [],
    }
    const query = createSpatialQuery(world.game, providers)

    expect(query.nearest(0, 0, { with: [Required] as const })).toBe(indexedOnly)
    expect(query.nearest(0, 0, { without: [Required] })).toBeNull()
    expect(query.nearest(0, 0, { exclude: indexedOnly })).toBeNull()
  })

  it('returns a live reference selected from an eager call-time snapshot', () => {
    const world = makeWorld()
    const selected = world.spawn('Selected', 1, 0)

    const result = world.game.query.nearest(0, 0)
    world.spawn('Later and closer', 0.1, 0)
    selected.position.x = 8
    selected.destroy()

    expect(result).toBe(selected)
    expect(result!.alive).toBe(false)
    expect(result!.position.x).toBe(8)
  })
})
