import { describe, expect, it } from 'vitest'
import { Component } from './component'
import { Solid } from './components/solid'
import { Tilemap } from './components/tilemap'
import { Entity } from './entity'
import type { Game } from './game'
import {
  SOLID_SOURCE_SYMBOL,
  type SolidSource,
} from './scene-solids'
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

class DerivedSolidSource extends Component implements SolidSource {
  readonly [SOLID_SOURCE_SYMBOL] = true
  derived: Solid[] = []

  solids(): readonly Solid[] {
    return this.derived
  }

  addSolid(properties: Partial<Solid> = {}): Solid {
    const solid = new Solid()
    solid.entity = this.entity
    solid.game = this.game
    Object.assign(solid, properties)
    this.derived.push(solid)
    return solid
  }
}

function expectVector(
  actual: Readonly<{ x: number; y: number }>,
  expected: Readonly<{ x: number; y: number }>,
): void {
  expect(actual.x).toBeCloseTo(expected.x, 10)
  expect(actual.y).toBeCloseTo(expected.y, 10)
}

describe('SpatialQuery.ray input, sources, and ordering', () => {
  it('normalizes direction and includes an exact maxDistance endpoint', () => {
    const world = makeWorld()
    const wall = world.spawn('Wall', 5, 0)
    const solid = wall.add(Solid, { width: 2, height: 2 })

    const hit = world.game.query.ray(0, 0, 100, 0, 4)

    expect(hit?.entity).toBe(wall)
    expect(hit?.solid).toBe(solid)
    expect(hit?.distance).toBe(4)
    expectVector(hit!.point, { x: 4, y: 0 })
    expectVector(hit!.normal, { x: -1, y: 0 })
    const snapped = world.game.query.ray(0, 0, 1, 0, 4 - 0.5e-9)
    expect(snapped?.distance).toBe(4 - 0.5e-9)
    expect(snapped?.point.x).toBe(4 - 0.5e-9)
    expect(world.game.query.ray(0, 0, 1, 0, 4 - 2e-9)).toBeNull()
  })

  it('keeps an endpoint entry when the Solid exits just beyond the segment', () => {
    const world = makeWorld()
    const wall = world.spawn('Thin wall', 1.00025, 0)
    const solid = wall.add(Solid, { width: 0.0005, height: 1000 })

    const hit = world.game.query.ray(0, 0, 1, 0, 1)

    expect(hit?.solid).toBe(solid)
    expect(hit?.distance).toBe(1)
    expectVector(hit!.normal, { x: -1, y: 0 })
  })

  it('keeps a zero-distance inward entry for a thin Solid', () => {
    const world = makeWorld()
    const wall = world.spawn('Thin wall', 1.00025, 0)
    const solid = wall.add(Solid, { width: 0.0005, height: 1000 })

    const hit = world.game.query.ray(1, 0, 1, 0, 0)

    expect(hit?.solid).toBe(solid)
    expect(hit?.distance).toBe(0)
    expectVector(hit!.normal, { x: -1, y: 0 })
  })

  it('normalizes finite direction components without overflow or underflow', () => {
    const diagonalWorld = makeWorld()
    diagonalWorld.spawn('Diagonal wall', 5, 5).add(Solid, { width: 2, height: 2 })
    const diagonal = diagonalWorld.game.query.ray(
      0,
      0,
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      10,
    )
    expect(diagonal?.distance).toBeCloseTo(Math.hypot(4, 4), 10)
    expectVector(diagonal!.point, { x: 4, y: 4 })

    const tinyWorld = makeWorld()
    tinyWorld.spawn('Tiny direction wall', 2, 0).add(Solid)
    expect(tinyWorld.game.query.ray(0, 0, Number.MIN_VALUE, 0, 10)?.distance).toBe(1.5)
  })

  it('returns null without throwing for every invalid input form', () => {
    const world = makeWorld()
    world.spawn('Wall').add(Solid)
    const inputs: Array<readonly [number, number, number, number, number]> = [
      [Number.NaN, 0, 1, 0, 1],
      [0, Infinity, 1, 0, 1],
      [0, 0, Number.NaN, 0, 1],
      [0, 0, 1, -Infinity, 1],
      [0, 0, 0, 0, 1],
      [0, 0, 1, 0, Number.NaN],
      [0, 0, 1, 0, Infinity],
      [0, 0, 1, 0, -0.001],
    ]

    for (const input of inputs) {
      expect(() => world.game.query.ray(...input)).not.toThrow()
      expect(world.game.query.ray(...input)).toBeNull()
    }
  })

  it('uses first physical-source order for exact and epsilon-distance ties', () => {
    const world = makeWorld()
    const first = world.spawn('First', 5 + 0.5e-9, 0)
    const firstSolid = first.add(Solid, { width: 2, height: 2 })
    const second = world.spawn('Second', 5, 0)
    second.add(Solid, { width: 2, height: 2 })

    expect(world.game.query.ray(0, 0, 1, 0, 10)?.solid).toBe(firstSolid)
  })

  it('reports a Tilemap-derived Solid with its owner and filters that owner', () => {
    const world = makeWorld()
    const map = world.spawn('Map')
    const tilemap = map.add(Tilemap, {
      mapWidth: 1,
      mapHeight: 1,
      cellSize: 2,
      cells: [7],
      solidTiles: [7],
    })
    const derived = tilemap.solids()[0]!

    const hit = world.game.query.ray(-2, 1, 1, 0, 10, { with: [Tilemap] as const })

    expect(hit?.entity).toBe(map)
    expect(hit?.solid).toBe(derived)
    expect(hit?.distance).toBe(2)
    expectVector(hit!.normal, { x: -1, y: 0 })
    expect(world.game.query.ray(-2, 1, 1, 0, 10, { with: [Solid] })).toBeNull()
    tilemap.cells = [-1]
    expect(tilemap.solids()).not.toContain(derived)
    expect(hit!.solid).toBe(derived)
  })

  it('keeps a direct Solid ahead of a source-derived Solid at the same distance', () => {
    const world = makeWorld()
    const owner = world.spawn('Owner', 3, 0)
    const direct = owner.add(Solid, { width: 2, height: 2 })
    owner.add(DerivedSolidSource).addSolid({ width: 2, height: 2 })

    expect(world.game.query.ray(0, 0, 1, 0, 10)?.solid).toBe(direct)
  })

  it('composes all filters against a source-derived Solid owner', () => {
    class Required extends Component {}
    class Forbidden extends Component {}
    const world = makeWorld()
    const owner = world.spawn('Owner', 3, 0)
    owner.add(Required)
    const source = owner.add(DerivedSolidSource)
    const derived = source.addSolid({ width: 2, height: 2 })

    expect(
      world.game.query.ray(0, 0, 1, 0, 10, {
        with: [Required, DerivedSolidSource] as const,
        without: [Forbidden],
        where: (candidate) => candidate.name === 'Owner',
      })?.solid,
    ).toBe(derived)
    expect(world.game.query.ray(0, 0, 1, 0, 10, { exclude: owner })).toBeNull()
    owner.add(Forbidden)
    expect(world.game.query.ray(0, 0, 1, 0, 10, { without: [Forbidden] })).toBeNull()
  })

  it('can replace the internal Solid provider and skips invalid candidates', () => {
    const world = makeWorld()
    const invalidOwner = new Entity(world.game, 'Invalid')
    const invalid = invalidOwner.add(Solid, { width: Number.NaN })
    const indexedOwner = new Entity(world.game, 'Indexed only')
    indexedOwner.position.set(4, 0, 0)
    const indexed = indexedOwner.add(Solid, { width: 2, height: 2 })
    const providers: SpatialQueryCandidateProviders = {
      hitboxes: () => [],
      transforms: () => [],
      solids: () => [
        { entity: invalidOwner, solid: invalid },
        { entity: indexedOwner, solid: indexed },
      ],
    }
    const query = createSpatialQuery(world.game, providers)

    expect(query.ray(0, 0, 1, 0, 10)?.solid).toBe(indexed)
  })

  it('returns live object references with detached query-time values', () => {
    const world = makeWorld()
    const wall = world.spawn('Wall', 3, 0)
    const solid = wall.add(Solid, { width: 2, height: 2 })

    const hit = world.game.query.ray(0, 0, 1, 0, 10)!
    world.spawn('Later and closer', 1.5, 0).add(Solid)
    wall.position.x = 20
    solid.width = 8
    wall.destroy()

    expect(hit.entity).toBe(wall)
    expect(hit.solid).toBe(solid)
    expect(hit.entity.alive).toBe(false)
    expect(hit.solid.width).toBe(8)
    expect(hit.distance).toBe(2)
    expect(hit.point).toEqual({ x: 2, y: 0 })
    expect(hit.normal).toEqual({ x: -1, y: 0 })
  })
})

describe('SpatialQuery.ray polygon crossings', () => {
  it('handles outside entry, interior exit, boundary directions, and maxDistance zero', () => {
    const world = makeWorld()
    world.spawn('Box', 1, 0).add(Solid, { width: 2, height: 2 })

    const entry = world.game.query.ray(-2, 0, 1, 0, 10)!
    expect(entry.distance).toBe(2)
    expectVector(entry.normal, { x: -1, y: 0 })

    const exit = world.game.query.ray(1, 0, 1, 0, 10)!
    expect(exit.distance).toBe(1)
    expectVector(exit.normal, { x: 1, y: 0 })

    const boundaryIn = world.game.query.ray(0, 0, 1, 0, 0)!
    expect(boundaryIn.distance).toBe(0)
    expectVector(boundaryIn.normal, { x: -1, y: 0 })
    expect(world.game.query.ray(0, 0, -1, 0, 10)).toBeNull()
    expect(world.game.query.ray(0, 0, 0, 1, 10)).toBeNull()
  })

  it('rejects travel collinear with an edge and vertex tangency', () => {
    const world = makeWorld()
    world.spawn('Box').add(Solid, { width: 2, height: 2 })

    expect(world.game.query.ray(-2, 1, 1, 0, 10)).toBeNull()
    expect(world.game.query.ray(-2, 0, 1, 1, 10)).toBeNull()
  })

  it('classifies strict exterior and interior origins more than epsilon from a boundary', () => {
    const world = makeWorld()
    world.spawn('Box', 1, 0).add(Solid, { width: 2, height: 2 })

    const outsideEntry = world.game.query.ray(-2e-9, 0, 1, 0, 1)
    const insideExit = world.game.query.ray(2e-9, 0, -1, 0, 1)

    expect(outsideEntry?.distance).toBeCloseTo(2e-9, 15)
    expect(insideExit?.distance).toBeCloseTo(2e-9, 15)
    expectVector(outsideEntry!.normal, { x: -1, y: 0 })
    expectVector(insideExit!.normal, { x: -1, y: 0 })
  })

  it('uses Solid offsets, absolute dimensions, fallbacks, and logical projected positions', () => {
    const projectedWorld = makeWorld()
    const projected = projectedWorld.spawn('Projected', 5, 5)
    projected.add(Solid, { offsetX: -2, width: -2, height: -2 })
    projected.setProjected(true)
    projected.node.position.set(100, 100, 0)
    const projectedHit = projectedWorld.game.query.ray(0, 5, 1, 0, 10)!
    expect(projectedHit.entity).toBe(projected)
    expect(projectedHit.distance).toBe(2)

    const unknownWorld = makeWorld()
    unknownWorld.spawn('Unknown shape', 3, 0).add(Solid, {
      shape: 'future-shape' as 'rectangle',
      width: 2,
      height: 2,
    })
    expect(unknownWorld.game.query.ray(0, 0, 1, 0, 10)?.distance).toBe(2)

    const fallbackWorld = makeWorld()
    fallbackWorld.spawn('Malformed polygon', 3, 0).add(Solid, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: [[0, 0], ['bad', 1], [1, 0]] as unknown as Array<[number, number]>,
    })
    expect(fallbackWorld.game.query.ray(0, 0, 1, 0, 10)?.distance).toBe(2.5)
  })

  it.each([
    ['counter-clockwise', [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]],
    ['clockwise', [
      [-0.5, 0.5],
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, -0.5],
    ]],
  ] as const)('uses exact %s polygon edges with outward normals', (_label, points) => {
    const world = makeWorld()
    world.spawn('Polygon').add(Solid, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: points.map((point) => [...point]),
    })

    const hit = world.game.query.ray(-2, 0, 1, 0, 10)!
    expect(hit.distance).toBe(1)
    expectVector(hit.point, { x: -1, y: 0 })
    expectVector(hit.normal, { x: -1, y: 0 })
  })

  it.each([
    ['counter-clockwise', false],
    ['clockwise', true],
  ] as const)('intersects the exact concavity in %s order', (_label, reverse) => {
    const world = makeWorld()
    const points: Array<[number, number]> = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, -0.1],
      [-0.1, -0.1],
      [-0.1, 0.5],
      [-0.5, 0.5],
    ]
    world.spawn('Concave').add(Solid, {
      shape: 'polygon',
      width: 4,
      height: 4,
      points: reverse ? [...points].reverse() : points,
    })

    const hit = world.game.query.ray(1, 3, 0, -1, 10)!
    expect(hit.distance).toBeCloseTo(3.4, 10)
    expectVector(hit.point, { x: 1, y: -0.4 })
    expectVector(hit.normal, { x: 0, y: 1 })
  })

  it('uses entry-minimum and exit-maximum face dots at vertices', () => {
    const world = makeWorld()
    world.spawn('Box').add(Solid, { width: 2, height: 2 })

    const entry = world.game.query.ray(-2, -2.5, 1, 1.5, 10)!
    expectVector(entry.point, { x: -1, y: -1 })
    expectVector(entry.normal, { x: 0, y: -1 })

    const exit = world.game.query.ray(0, -0.5, 1, 1.5, 10)!
    expectVector(exit.point, { x: 1, y: 1 })
    expectVector(exit.normal, { x: 0, y: 1 })
  })

  it('uses edge order when vertex face dots remain tied', () => {
    const world = makeWorld()
    world.spawn('Box').add(Solid, { width: 2, height: 2 })

    const hit = world.game.query.ray(-2, -2, 1, 1, 10)!
    expectVector(hit.point, { x: -1, y: -1 })
    expectVector(hit.normal, { x: 0, y: -1 })
  })

  it('ignores zero-length edges and zero-area polygons', () => {
    const world = makeWorld()
    const valid = world.spawn('Valid with duplicate vertex', 3, 0)
    valid.add(Solid, {
      shape: 'polygon',
      width: 2,
      height: 2,
      points: [
        [-0.5, -0.5],
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    })
    const zeroArea = world.spawn('Zero area', 1, 0)
    zeroArea.add(Solid, {
      shape: 'polygon',
      points: [
        [-0.5, 0],
        [0, 0],
        [0.5, 0],
      ],
    })

    expect(world.game.query.ray(0, 0, 1, 0, 10)?.entity).toBe(valid)
  })
})

describe('SpatialQuery.ray analytic ellipses', () => {
  it('returns the analytic non-square ellipse crossing and gradient normal', () => {
    const world = makeWorld()
    world.spawn('Ellipse').add(Solid, { shape: 'circle', width: -4, height: -2 })

    const hit = world.game.query.ray(-3, 0.5, 7, 0, 10)!
    const expectedX = -Math.sqrt(3)
    const gradientLength = Math.hypot(expectedX / 4, 0.5)

    expect(hit.distance).toBeCloseTo(3 + expectedX, 10)
    expectVector(hit.point, { x: expectedX, y: 0.5 })
    expectVector(hit.normal, {
      x: expectedX / 4 / gradientLength,
      y: 0.5 / gradientLength,
    })
    expect(Math.hypot(hit.normal.x, hit.normal.y)).toBeCloseTo(1, 12)
  })

  it.each([
    ['large scale', 0, -200_000, 200_000, 100_000],
    ['large translation', 100_000_000, 0, 2, 99_999_999],
  ] as const)(
    'preserves the analytic entry under %s',
    (_label, centerX, originX, diameter, expectedDistance) => {
      const world = makeWorld()
      world.spawn('Ellipse', centerX, 0).add(Solid, {
        shape: 'circle',
        width: diameter,
        height: diameter,
      })

      const hit = world.game.query.ray(originX, 0, 1, 0, expectedDistance)

      expect(hit?.distance).toBe(expectedDistance)
      expectVector(hit!.point, { x: centerX - diameter / 2, y: 0 })
      expectVector(hit!.normal, { x: -1, y: 0 })
    },
  )

  it('rejects analytic tangency and zero-radius ellipses', () => {
    const tangentWorld = makeWorld()
    tangentWorld.spawn('Ellipse').add(Solid, { shape: 'circle', width: 4, height: 2 })
    expect(tangentWorld.game.query.ray(-3, 1, 1, 0, 10)).toBeNull()

    const zeroWorld = makeWorld()
    zeroWorld.spawn('Zero ellipse').add(Solid, { shape: 'circle', width: 0, height: 2 })
    expect(zeroWorld.game.query.ray(-3, 0, 1, 0, 10)).toBeNull()
  })

  it('applies strict boundary direction rules to an ellipse', () => {
    const world = makeWorld()
    world.spawn('Ellipse').add(Solid, { shape: 'circle', width: 4, height: 2 })

    const inward = world.game.query.ray(-2, 0, 1, 0, 0)!
    expect(inward.distance).toBe(0)
    expectVector(inward.normal, { x: -1, y: 0 })
    const exit = world.game.query.ray(0, 0, 1, 0, 10)!
    expect(exit.distance).toBe(2)
    expectVector(exit.normal, { x: 1, y: 0 })
    expect(world.game.query.ray(-2, 0, -1, 0, 10)).toBeNull()
    expect(world.game.query.ray(-2, 0, 0, 1, 10)).toBeNull()
  })
})
