import { collisionBody } from './collision-body.js'
import { collisionOverlap, type CollisionBody } from './collision-shape.js'
import type { Component, ComponentClass } from './component.js'
import { Hitbox } from './components/hitbox.js'
import { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import { sceneSolids } from './scene-solids.js'
import {
  collisionBodyContainsPoint,
  collisionBodyRay,
  SPATIAL_QUERY_EPSILON,
  usableCollisionBody,
} from './spatial-query-geometry.js'

type ComponentClasses = readonly ComponentClass[]
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
  /** Hitbox owners with positive interior overlap, in Entity order. */
  area<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(body: CollisionBody, filter: SpatialGuardFilter<Classes, Narrowed>): Narrowed[]
  area<Classes extends ComponentClasses = readonly []>(
    body: CollisionBody,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  area(body: CollisionBody, filter?: SpatialQueryFilter): Entity[]

  /** Hitbox owners that strictly contain a logical point, in Entity order. */
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
}

export interface HitboxCandidate {
  readonly entity: Entity
  readonly hitbox: Hitbox
}

export interface SolidCandidate {
  readonly entity: Entity
  readonly solid: Solid
}

/** Package-internal candidate boundary reserved for future acceleration. */
export interface SpatialQueryCandidateProviders {
  hitboxes(): readonly HitboxCandidate[]
  transforms(): readonly Entity[]
  solids(): readonly SolidCandidate[]
}

function linearCandidateProviders(game: Game): SpatialQueryCandidateProviders {
  return {
    hitboxes() {
      const result: HitboxCandidate[] = []
      for (const entity of [...game.entities]) {
        if (!entity.alive) continue
        const hitbox = entity.get(Hitbox)
        if (hitbox) result.push({ entity, hitbox })
      }
      return result
    },
    transforms() {
      return [...game.entities].filter((entity) => entity.alive)
    },
    solids() {
      return sceneSolids(game)
        .filter((solid) => solid.entity.alive)
        .map((solid) => ({ entity: solid.entity, solid }))
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
  constructor(private readonly candidates: SpatialQueryCandidateProviders) {}

  area(body: CollisionBody, filter?: SpatialQueryFilter<ComponentClasses>): Entity[] {
    if (!usableCollisionBody(body)) return []
    const candidates = [...this.candidates.hitboxes()].filter(({ entity }) => entity.alive)
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
    const candidates = [...this.candidates.hitboxes()].filter(({ entity }) => entity.alive)
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
    const candidates = [...this.candidates.solids()].filter(({ entity }) => entity.alive)
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

/** Package-internal constructor; only the SpatialQuery interface is public. */
export function createSpatialQuery(
  game: Game,
  candidates: SpatialQueryCandidateProviders = linearCandidateProviders(game),
): SpatialQuery {
  return new LinearSpatialQuery(candidates)
}
