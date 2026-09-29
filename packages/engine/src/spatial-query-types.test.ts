// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    render(): void {}
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import * as engine from './index'
import {
  Component,
  Entity,
  Game,
  Hitbox,
  Solid,
  loadScene,
  type CollisionBody,
  type EntityWith,
  type NearestQueryContext,
  type NearestSpatialQueryFilter,
  type RayHit,
  type SpatialQuery,
  type SpatialQueryFilter,
} from './index'
import { defined } from './test-support'

class RequiredA extends Component {}
class RequiredB extends Component {}
class TaggedEntity extends Entity {
  readonly tag = 'tagged' as const
}

const body: CollisionBody = { x: 0, y: 0, width: 1, height: 1 }

// The standard exact type-equality check: its phantom T is the point.
type Equal<X, Y> =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the phantom T of the type-equality check
  (<T>() => T extends X ? 1 : 2) extends
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the phantom T of the type-equality check
  (<T>() => T extends Y ? 1 : 2)
    ? true
    : false

type IsReadonly<T, K extends keyof T> = Equal<
  { [P in K]: T[P] },
  { -readonly [P in K]: T[P] }
> extends true
  ? false
  : true

function proveQueryTypes(query: SpatialQuery): void {
  const required = [RequiredA, RequiredB] as const
  const area = query.area(body, { with: required })
  const point = query.point(0, 0, { with: required })
  const nearest = query.nearest(0, 0, { with: required })
  const ray = query.ray(0, 0, 1, 0, 10, { with: required })

  expectTypeOf(area).toEqualTypeOf<EntityWith<typeof required>[]>()
  expectTypeOf(point).toEqualTypeOf<EntityWith<typeof required>[]>()
  expectTypeOf(nearest).toEqualTypeOf<EntityWith<typeof required> | null>()
  expectTypeOf(ray).toEqualTypeOf<RayHit<EntityWith<typeof required>> | null>()
  expectTypeOf(defined(area[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()
  expectTypeOf(defined(area[0]).get(RequiredB)).toEqualTypeOf<RequiredB>()
  expectTypeOf(defined(point[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()
  expectTypeOf(defined(nearest).get(RequiredB)).toEqualTypeOf<RequiredB>()
  expectTypeOf(defined(ray).entity.get(RequiredA)).toEqualTypeOf<RequiredA>()
  expectTypeOf(defined(ray).solid).toEqualTypeOf<Solid>()

  const guarded = query.area(body, {
    with: [RequiredA] as const,
    where: (entity): entity is EntityWith<readonly [typeof RequiredA]> & TaggedEntity =>
      entity instanceof TaggedEntity,
  })
  expectTypeOf(guarded).toEqualTypeOf<
    Array<EntityWith<readonly [typeof RequiredA]> & TaggedEntity>
  >()
  expectTypeOf(defined(guarded[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()
  expectTypeOf(defined(guarded[0]).tag).toEqualTypeOf<'tagged'>()

  const guardedPoint = query.point(0, 0, {
    with: [RequiredA] as const,
    where: (entity): entity is EntityWith<readonly [typeof RequiredA]> & TaggedEntity =>
      entity instanceof TaggedEntity,
  })
  const guardedNearest = query.nearest(0, 0, {
    with: [RequiredA] as const,
    where: (
      entity,
      _context,
    ): entity is EntityWith<readonly [typeof RequiredA]> & TaggedEntity =>
      entity instanceof TaggedEntity,
  })
  const guardedRay = query.ray(0, 0, 1, 0, 10, {
    with: [RequiredA] as const,
    where: (entity): entity is EntityWith<readonly [typeof RequiredA]> & TaggedEntity =>
      entity instanceof TaggedEntity,
  })
  expectTypeOf(guardedPoint).toEqualTypeOf<
    Array<EntityWith<readonly [typeof RequiredA]> & TaggedEntity>
  >()
  expectTypeOf(guardedNearest).toEqualTypeOf<
    (EntityWith<readonly [typeof RequiredA]> & TaggedEntity) | null
  >()
  expectTypeOf(guardedRay).toEqualTypeOf<
    RayHit<EntityWith<readonly [typeof RequiredA]> & TaggedEntity> | null
  >()
  expectTypeOf(defined(guardedPoint[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()
  expectTypeOf(defined(guardedNearest).tag).toEqualTypeOf<'tagged'>()
  expectTypeOf(defined(guardedRay).entity.tag).toEqualTypeOf<'tagged'>()

  const booleanWhere = query.point(0, 0, {
    with: [RequiredA] as const,
    where: (entity) => entity.name.length > 0,
  })
  expectTypeOf(defined(booleanWhere[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()

  const reusable: SpatialQueryFilter<readonly [typeof RequiredA]> = {
    with: [RequiredA] as const,
    without: [RequiredB],
    where: (entity) => entity.get(RequiredA) instanceof RequiredA,
  }
  expectTypeOf(defined(query.area(body, reusable)[0]).get(RequiredA)).toEqualTypeOf<RequiredA>()

  const nearestFilter: NearestSpatialQueryFilter<readonly [typeof RequiredA]> = {
    with: [RequiredA] as const,
    maxDistance: 5,
    where: (entity, context) => {
      expectTypeOf(entity.get(RequiredA)).toEqualTypeOf<RequiredA>()
      expectTypeOf(context).toEqualTypeOf<NearestQueryContext>()
      return context.distance <= 5
    },
  }
  expectTypeOf(defined(query.nearest(0, 0, nearestFilter)).get(RequiredA)).toEqualTypeOf<RequiredA>()

  expectTypeOf(query.area(body)).toEqualTypeOf<Entity[]>()
  expectTypeOf(query.point(0, 0)).toEqualTypeOf<Entity[]>()
  expectTypeOf(query.area(body, undefined)).toEqualTypeOf<Entity[]>()
  expectTypeOf(query.point(0, 0, undefined)).toEqualTypeOf<Entity[]>()
  expectTypeOf(query.nearest(0, 0, undefined)).toEqualTypeOf<Entity | null>()
  expectTypeOf(query.ray(0, 0, 1, 0, 10, undefined)).toEqualTypeOf<RayHit | null>()
  expectTypeOf(query.area(body, { without: [Hitbox] })).toEqualTypeOf<Entity[]>()
  expectTypeOf(query.ray(0, 0, 1, 0, 10)).toEqualTypeOf<RayHit | null>()
}

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public SpatialQuery types', () => {
  it('narrows every operation through required components and type guards', () => {
    const game = makeGame()
    expectTypeOf(game.query).toEqualTypeOf<SpatialQuery>()
    expectTypeOf<IsReadonly<Game, 'query'>>().toEqualTypeOf<true>()
    game.dispose()
  })

  it('exports only the public vocabulary from the package root', () => {
    expectTypeOf<SpatialQueryFilter>().toMatchTypeOf<object>()
    expectTypeOf<NearestSpatialQueryFilter>().toMatchTypeOf<object>()
    expectTypeOf<EntityWith<readonly [typeof Hitbox]> extends Entity ? true : false>()
      .toEqualTypeOf<true>()
    expect(engine).not.toHaveProperty('createSpatialQuery')
    expect(engine).not.toHaveProperty('spatialQueryCandidates')
  })

  it('keeps one query service identity through scene load, unload, and swap', () => {
    const game = makeGame()
    const query = game.query

    loadScene(game, { waicaScene: 3, entities: [{ name: 'First' }] }, { components: {} })
    expect(game.query).toBe(query)
    game.unloadScene()
    expect(game.query).toBe(query)
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Second' }] }, { components: {} })
    expect(game.query).toBe(query)

    game.dispose()
  })
})
