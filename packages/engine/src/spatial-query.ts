import type { Component, ComponentClass } from './component.js'
import type { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { CollisionBody } from './collision-shape.js'

type ComponentClasses = readonly ComponentClass[]
type QueryEntity<Classes extends ComponentClasses> = Classes extends readonly []
  ? Entity
  : EntityWith<Classes>

/** An Entity whose required component classes return non-optional instances. */
export interface EntityWith<Classes extends ComponentClasses> extends Entity {
  get<Class extends Classes[number]>(component: Class): InstanceType<Class>
  get<T extends Component>(component: ComponentClass<T>): T | undefined
}

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

export interface NearestSpatialQueryFilter<Classes extends ComponentClasses = readonly []> {
  with?: Classes
  without?: readonly ComponentClass[]
  exclude?: Entity | readonly Entity[] | ReadonlySet<Entity>
  where?: (entity: QueryEntity<Classes>, context: NearestQueryContext) => boolean
  /** Inclusive logical-space radius; omitted or positive Infinity is unlimited. */
  maxDistance?: number
}

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
  area<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(body: CollisionBody, filter: SpatialGuardFilter<Classes, Narrowed>): Narrowed[]
  area<Classes extends ComponentClasses = readonly []>(
    body: CollisionBody,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  area(body: CollisionBody): Entity[]

  point<
    Classes extends ComponentClasses = readonly [],
    Narrowed extends QueryEntity<Classes> = QueryEntity<Classes>,
  >(x: number, y: number, filter: SpatialGuardFilter<Classes, Narrowed>): Narrowed[]
  point<Classes extends ComponentClasses = readonly []>(
    x: number,
    y: number,
    filter: SpatialQueryFilter<Classes>,
  ): QueryEntity<Classes>[]
  point(x: number, y: number): Entity[]

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
  nearest(x: number, y: number): Entity | null

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
  ray(x: number, y: number, dx: number, dy: number, maxDistance: number): RayHit | null
}

class LinearSpatialQuery {
  constructor(private readonly game: Game) {}

  area(_body: CollisionBody, _filter?: SpatialQueryFilter<ComponentClasses>): Entity[] {
    void this.game
    return []
  }

  point(_x: number, _y: number, _filter?: SpatialQueryFilter<ComponentClasses>): Entity[] {
    return []
  }

  nearest(
    _x: number,
    _y: number,
    _filter?: NearestSpatialQueryFilter<ComponentClasses>,
  ): Entity | null {
    return null
  }

  ray(
    _x: number,
    _y: number,
    _dx: number,
    _dy: number,
    _maxDistance: number,
    _filter?: SpatialQueryFilter<ComponentClasses>,
  ): RayHit | null {
    return null
  }
}

/** Package-internal constructor; only the SpatialQuery interface is public. */
export function createSpatialQuery(game: Game): SpatialQuery {
  return new LinearSpatialQuery(game)
}
