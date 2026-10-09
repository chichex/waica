import { collisionBody } from './collision-body.js'
import {
  collisionBounds,
  collisionOverlap,
  type CollisionBody,
  type CollisionBounds,
} from './collision-shape.js'
import type { Component, ComponentClass } from './component.js'
import { Hitbox } from './components/hitbox.js'
import { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { SceneSpace } from './scene-space.js'
import {
  createHitboxBroadphase,
  createSolidBroadphase,
} from './spatial-broadphase.js'
import { SpatialQuery3d, type Point3d, type QueryVolume3d, type RayHit3d } from './spatial-query-3d.js'
import {
  collisionBodyContainsPoint,
  collisionBodyRay,
  SPATIAL_QUERY_EPSILON,
  usableCollisionBody,
} from './spatial-query-geometry.js'

export type ComponentClasses = readonly ComponentClass[]
type QueryEntity<Classes extends ComponentClasses> = Classes extends readonly []
  ? Entity
  : EntityWith<Classes>

/** An Entity whose required component classes return non-optional instances. */
export interface EntityWith<Classes extends ComponentClasses> extends Entity {
  get<Class extends Classes[number]>(component: Class): InstanceType<Class>
  get<T extends Component>(component: ComponentClass<T>): T | undefined
}

/** Declarative eligibility shared by area, point, and ray queries. */
export interface SpatialQueryFilter<Classes extends ComponentClasses = readonly []> {
  /** Every listed component class must be present. */
  with?: Classes
  /** A candidate carrying any listed class is rejected. */
  without?: readonly ComponentClass[]
  /** Entity identities omitted from the result. */
  exclude?: Entity | readonly Entity[] | ReadonlySet<Entity>
  /** Final eligibility predicate. */
  where?: (entity: QueryEntity<Classes>) => boolean
}

export interface NearestQueryContext {
  readonly distance: number
}

/** Entity eligibility plus an optional inclusive logical-space radius. */
export interface NearestSpatialQueryFilter<Classes extends ComponentClasses = readonly []> {
  with?: Classes
  without?: readonly ComponentClass[]
  exclude?: Entity | readonly Entity[] | ReadonlySet<Entity>
  where?: (entity: QueryEntity<Classes>, context: NearestQueryContext) => boolean
  /** Inclusive logical-space radius; omitted or positive Infinity is unlimited. */
  maxDistance?: number
}

/** One query-time crossing paired with the live Solid and owning Entity. */
export interface RayHit<T extends Entity = Entity> {
  readonly entity: T
  readonly solid: Solid
  readonly distance: number
  readonly point: Readonly<{ x: number; y: number }>
  readonly normal: Readonly<{ x: number; y: number }>
}

type SpatialGuardFilter<
  Classes extends ComponentClasses,
  Narrowed extends QueryEntity<Classes>,
> = Omit<SpatialQueryFilter<Classes>, 'where'> & {
  where: (entity: QueryEntity<Classes>) => entity is Narrowed
}

type NearestGuardFilter<
  Classes extends ComponentClasses,
  Narrowed extends QueryEntity<Classes>,
> = Omit<NearestSpatialQueryFilter<Classes>, 'where'> & {
  where: (
    entity: QueryEntity<Classes>,
    context: NearestQueryContext,
  ) => entity is Narrowed
}

/** Public logical-space spatial-query service owned by every Game. */
export interface SpatialQuery {
  /** Hitbox owners with positive interior overlap, mask-agnostic and in Entity order. */
  area<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(body: CollisionBody, filter: SpatialGuardFilter<Classes, Narrowed>): Narrowed[]
  /** In a 3D scene `area` takes a volume and returns the entities whose sensor colliders intersect it, in Entity order. */
  area<Classes extends ComponentClasses = readonly []>(
    body: CollisionBody | QueryVolume3d,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  area(body: CollisionBody | QueryVolume3d, filter?: SpatialQueryFilter): Entity[]

  /** Hitbox owners that strictly contain a point, mask-agnostic and in Entity order. */
  point<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(x: number, y: number, filter: SpatialGuardFilter<Classes, Narrowed>): Narrowed[]
  point<Classes extends ComponentClasses = readonly []>(
    x: number,
    y: number,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  point(x: number, y: number, filter?: SpatialQueryFilter): Entity[]
  /** 3D scenes: entities whose sensor colliders contain the point, in Entity order. */
  point<Classes extends ComponentClasses = readonly []>(
    at: Point3d,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  point(at: Point3d, filter?: SpatialQueryFilter): Entity[]

  /** Closest filtered logical transform; equal distances retain Entity order. */
  nearest<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(
    x: number,
    y: number,
    filter: NearestGuardFilter<Classes, Narrowed>,
  ): Narrowed | null
  nearest<Classes extends ComponentClasses = readonly []>(
    x: number,
    y: number,
    filter: NearestSpatialQueryFilter<Classes>,
  ): QueryEntity<Classes> | null
  nearest(x: number, y: number, filter?: NearestSpatialQueryFilter): Entity | null
  /** 3D scenes: the closest filtered transform, z included. */
  nearest<Classes extends ComponentClasses = readonly []>(
    at: Point3d,
    filter: NearestSpatialQueryFilter<Classes>,
  ): QueryEntity<Classes> | null
  nearest(at: Point3d, filter?: NearestSpatialQueryFilter): Entity | null

  /** First strict crossing of direct or source-derived Solid geometry. */
  ray<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxDistance: number,
    filter: SpatialGuardFilter<Classes, Narrowed>,
  ): RayHit<Narrowed> | null
  ray<Classes extends ComponentClasses = readonly []>(
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxDistance: number,
    filter: SpatialQueryFilter<Classes>,
  ): RayHit<QueryEntity<Classes>> | null
  ray(
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxDistance: number,
    filter?: SpatialQueryFilter,
  ): RayHit | null
  /** 3D scenes: the first solid collider along the ray (sensors never block it); `direction` need not be a unit vector. */
  ray<Classes extends ComponentClasses = readonly []>(
    origin: Point3d,
    direction: Point3d,
    maxDistance: number,
    filter: SpatialQueryFilter<Classes>,
  ): RayHit3d<QueryEntity<Classes>> | null
  ray(origin: Point3d, direction: Point3d, maxDistance: number, filter?: SpatialQueryFilter): RayHit3d | null
}

export interface HitboxCandidate {
  readonly entity: Entity
  readonly hitbox: Hitbox
}

export interface SolidCandidate {
  readonly entity: Entity
  readonly solid: Solid
}

/** Package-internal candidate boundary used by the Game-owned broadphase. */
export interface SpatialQueryCandidateProviders {
  hitboxes(bounds: CollisionBounds): readonly HitboxCandidate[]
  transforms(): readonly Entity[]
  solids(bounds: CollisionBounds): readonly SolidCandidate[]
}

/** Package-internal deterministic candidate-count seam for tests. */
export interface SpatialQueryInstrumentation {
  onCandidates(domain: 'hitbox' | 'solid', count: number): void
}

function indexedCandidateProviders(game: Game): SpatialQueryCandidateProviders {
  return {
    hitboxes(bounds) {
      return createHitboxBroadphase(game).candidates(bounds)
    },
    transforms() {
      return [...game.entities].filter((entity) => entity.alive)
    },
    solids(bounds) {
      return createSolidBroadphase(game).candidates(bounds)
    },
  }
}

function isReadonlyEntitySet(value: unknown): value is ReadonlySet<Entity> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<ReadonlySet<Entity>>
  return (
    typeof candidate.size === 'number' &&
    typeof candidate.has === 'function' &&
    typeof candidate[Symbol.iterator] === 'function'
  )
}

function isExcluded(entity: Entity, exclude: SpatialQueryFilter['exclude']): boolean {
  if (!exclude) return false
  if (Array.isArray(exclude)) return exclude.includes(entity)
  if (isReadonlyEntitySet(exclude)) return exclude.has(entity)
  return exclude === entity
}

function matchesCommonFilter(
  entity: Entity,
  filter:
    | Pick<SpatialQueryFilter<ComponentClasses>, 'with' | 'without' | 'exclude'>
    | undefined,
): boolean {
  if (!filter) return true
  if (filter.with?.some((component) => !entity.has(component))) return false
  if (filter.without?.some((component) => entity.has(component))) return false
  return !isExcluded(entity, filter.exclude)
}

function matchesFilter(
  entity: Entity,
  filter: SpatialQueryFilter<ComponentClasses> | undefined,
): boolean {
  return (
    matchesCommonFilter(entity, filter) &&
    (!filter?.where || filter.where(entity as EntityWith<ComponentClasses>))
  )
}

class LinearSpatialQuery {
  constructor(
    private readonly candidates: SpatialQueryCandidateProviders,
    private readonly instrumentation?: SpatialQueryInstrumentation,
  ) {}

  area(body: CollisionBody, filter?: SpatialQueryFilter<ComponentClasses>): Entity[] {
    if (!usableCollisionBody(body)) return []
    const candidates = [...this.candidates.hitboxes(collisionBounds(body))].filter(
      ({ entity }) => entity.alive,
    )
    this.instrumentation?.onCandidates('hitbox', candidates.length)
    const result: Entity[] = []
    for (const { entity, hitbox } of candidates) {
      if (!matchesFilter(entity, filter)) continue
      const candidateBody = collisionBody(hitbox)
      if (usableCollisionBody(candidateBody) && collisionOverlap(body, candidateBody)) {
        result.push(entity)
      }
    }
    return result
  }

  point(x: number, y: number, filter?: SpatialQueryFilter<ComponentClasses>): Entity[] {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return []
    const candidates = [
      ...this.candidates.hitboxes({ left: x, right: x, bottom: y, top: y }),
    ].filter(({ entity }) => entity.alive)
    this.instrumentation?.onCandidates('hitbox', candidates.length)
    const result: Entity[] = []
    for (const { entity, hitbox } of candidates) {
      if (!matchesFilter(entity, filter)) continue
      if (collisionBodyContainsPoint(collisionBody(hitbox), x, y)) result.push(entity)
    }
    return result
  }

  nearest(
    x: number,
    y: number,
    filter?: NearestSpatialQueryFilter<ComponentClasses>,
  ): Entity | null {
    const maxDistance = filter?.maxDistance ?? Infinity
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Number.isNaN(maxDistance) ||
      maxDistance < 0 ||
      (maxDistance !== Infinity && !Number.isFinite(maxDistance))
    ) {
      return null
    }
    const candidates = [...this.candidates.transforms()].filter((entity) => entity.alive)
    let result: Entity | null = null
    let nearestDistance = Infinity
    for (const entity of candidates) {
      if (!matchesCommonFilter(entity, filter)) continue
      const distance = Math.hypot(entity.position.x - x, entity.position.y - y)
      if (Number.isNaN(distance) || distance > maxDistance) continue
      if (
        filter?.where &&
        !filter.where(entity as EntityWith<ComponentClasses>, { distance })
      ) {
        continue
      }
      if (result === null || distance < nearestDistance) {
        result = entity
        nearestDistance = distance
      }
    }
    return result
  }

  ray(
    x: number,
    y: number,
    dx: number,
    dy: number,
    maxDistance: number,
    filter?: SpatialQueryFilter<ComponentClasses>,
  ): RayHit | null {
    const directionScale = Math.max(Math.abs(dx), Math.abs(dy))
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(maxDistance) ||
      directionScale === 0 ||
      maxDistance < 0
    ) {
      return null
    }
    const scaledX = dx / directionScale
    const scaledY = dy / directionScale
    const scaledLength = Math.hypot(scaledX, scaledY)
    const unitX = scaledX / scaledLength
    const unitY = scaledY / scaledLength
    const endX = x + unitX * maxDistance
    const endY = y + unitY * maxDistance
    const candidates = [
      ...this.candidates.solids({
        left: Math.min(x, endX) - SPATIAL_QUERY_EPSILON,
        right: Math.max(x, endX) + SPATIAL_QUERY_EPSILON,
        bottom: Math.min(y, endY) - SPATIAL_QUERY_EPSILON,
        top: Math.max(y, endY) + SPATIAL_QUERY_EPSILON,
      }),
    ].filter(({ entity }) => entity.alive)
    this.instrumentation?.onCandidates('solid', candidates.length)
    let result: RayHit | null = null
    for (const { entity, solid } of candidates) {
      if (!matchesFilter(entity, filter)) continue
      const hit = collisionBodyRay(
        collisionBody(solid),
        x,
        y,
        unitX,
        unitY,
        maxDistance,
      )
      if (!hit) continue
      if (result && hit.distance >= result.distance - SPATIAL_QUERY_EPSILON) continue
      result = {
        entity,
        solid,
        distance: hit.distance,
        point: { x: hit.point.x, y: hit.point.y },
        normal: { x: hit.normal.x, y: hit.normal.y },
      }
    }
    return result
  }
}

/** A volume names its place by `center`; a collision body by `x` and `y`. */
const isVolume = (value: CollisionBody | QueryVolume3d): value is QueryVolume3d =>
  typeof value === 'object' && value !== null && 'center' in value

type Filter = SpatialQueryFilter<ComponentClasses>
type NearestFilter = NearestSpatialQueryFilter<ComponentClasses>
type Ray2dArgs = [x: number, y: number, dx: number, dy: number, maxDistance: number, filter?: Filter]
type Ray3dArgs = [origin: Point3d, direction: Point3d, maxDistance: number, filter?: Filter]

const isRay3d = (args: Ray2dArgs | Ray3dArgs): args is Ray3dArgs => typeof args[0] === 'object'

/**
 * Sends each call to the form its arguments name and refuses the form of the
 * other space with an error naming both (issue #159 CA-21): the 2D forms read
 * Hitboxes and Solids and take numbers or a collision body; the 3D forms read
 * the physics world and take `{ x, y, z }` objects.
 */
class SpaceSpatialQuery {
  private readonly solid: SpatialQuery3d

  constructor(
    private readonly game: Game,
    private readonly flat: LinearSpatialQuery,
  ) {
    this.solid = new SpatialQuery3d(game, { matches: matchesFilter, matchesCommon: matchesCommonFilter })
  }

  area(first: CollisionBody | QueryVolume3d, filter?: Filter): Entity[] {
    if (isVolume(first)) return this.in3d('area').area(first, filter)
    this.require('area', '2d')
    return this.flat.area(first, filter)
  }

  point(first: number | Point3d, second?: number | Filter, third?: Filter): Entity[] {
    if (typeof first === 'object') return this.in3d('point').point(first, typeof second === 'object' ? second : undefined)
    this.require('point', '2d')
    return this.flat.point(first, typeof second === 'number' ? second : Number.NaN, third)
  }

  nearest(first: number | Point3d, second?: number | NearestFilter, third?: NearestFilter): Entity | null {
    if (typeof first === 'object') return this.in3d('nearest').nearest(first, typeof second === 'object' ? second : undefined)
    this.require('nearest', '2d')
    return this.flat.nearest(first, typeof second === 'number' ? second : Number.NaN, third)
  }

  ray(...args: Ray2dArgs): RayHit | null
  ray(...args: Ray3dArgs): RayHit3d | null
  ray(...args: Ray2dArgs | Ray3dArgs): RayHit | RayHit3d | null {
    if (isRay3d(args)) {
      const [origin, direction, maxDistance, filter] = args
      return this.in3d('ray').ray({ origin, direction }, maxDistance, filter)
    }
    this.require('ray', '2d')
    return this.flat.ray(...args)
  }

  private in3d(operation: string): SpatialQuery3d {
    this.require(operation, '3d')
    return this.solid
  }

  private require(operation: string, space: SceneSpace): void {
    // Only a 3D scene turns the 2D forms away; anything else (no scene, or a stand-in Game) is the 2D world.
    if (space === '3d' ? this.game.space === '3d' : this.game.space !== '3d') return
    throw new Error(
      `game.query.${operation}: the ${space === '3d' ? '3D' : '2D'} form needs a ${space} scene, and the live scene is ${this.game.space}.`,
    )
  }
}

/** Package-internal constructor; only the SpatialQuery interface is public. */
export function createSpatialQuery(
  game: Game,
  candidates: SpatialQueryCandidateProviders = indexedCandidateProviders(game),
  instrumentation?: SpatialQueryInstrumentation,
): SpatialQuery {
  return new SpaceSpatialQuery(game, new LinearSpatialQuery(candidates, instrumentation))
}
