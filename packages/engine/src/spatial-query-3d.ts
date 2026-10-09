import type { Collider } from './components/collider.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { BodyRecord } from './physics-3d/body-sync.js'
import type { PhysicsWorld } from './physics-3d/physics-world.js'
import { castWorldRay, recordsAtPoint, recordsInVolume, type Point3d, type QueryVolume3d } from './physics-3d/world-queries.js'
import type { ComponentClasses, NearestSpatialQueryFilter, SpatialQueryFilter } from './spatial-query.js'

export type { Point3d, QueryVolume3d } from './physics-3d/world-queries.js'

/** The first solid collider a 3D ray reached, with its entity and the crossing (issue #159 CA-21). */
export interface RayHit3d<T extends Entity = Entity> {
  readonly entity: T
  readonly collider: Collider
  readonly distance: number
  readonly point: Readonly<Point3d>
  readonly normal: Readonly<Point3d>
}

type Filter = SpatialQueryFilter<ComponentClasses> | undefined
type NearestFilter = NearestSpatialQueryFilter<ComponentClasses> | undefined

/** The entity filter the 2D forms use, shared with the 3D ones (`spatial-query.ts` owns it). */
export interface EntityRules {
  matches(entity: Entity, filter: Filter): boolean
  matchesCommon(entity: Entity, filter: NearestFilter): boolean
}

const isPoint3d = (value: unknown): value is Point3d =>
  typeof value === 'object' && value !== null && ['x', 'y', 'z'].every((axis) => Number.isFinite(Reflect.get(value, axis)))

/** The farthest a nearest query looks: its `maxDistance`, or no limit. */
const rangeOf = (filter: NearestFilter): number => filter?.maxDistance ?? Infinity

/** What a nearest query measures against: a place, the shared filter and the farthest it looks. */
interface NearestSearch {
  at: Point3d
  filter: NearestFilter
  maxDistance: number
}

/** The 3D forms of `game.query` (ADR 0015's domains kept): `ray` reads solids, `area` and `point` read sensors, `nearest` reads transforms. */
export class SpatialQuery3d {
  constructor(
    private readonly game: Game,
    private readonly rules: EntityRules,
  ) {}

  /** `direction` need not be a unit vector; `maxDistance` is in world units. */
  ray(aim: { origin: Point3d; direction: Point3d }, maxDistance: number, filter?: Filter): RayHit3d | null {
    const { origin, direction } = aim
    const world = this.worldNow()
    const length = isPoint3d(direction) ? Math.hypot(direction.x, direction.y, direction.z) : 0
    if (!world || !isPoint3d(origin) || length === 0 || !(maxDistance >= 0) || !Number.isFinite(maxDistance)) return null
    const unit = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
    const hit = castWorldRay(world, { origin, direction: unit, maxDistance }, (record) => this.eligible(record, filter, false))
    if (!hit) return null
    return { entity: hit.record.entity, collider: hit.record.collider, distance: hit.distance, point: hit.point, normal: hit.normal }
  }

  area(volume: QueryVolume3d, filter?: Filter): Entity[] {
    const world = this.worldNow()
    if (!world) return []
    return this.inEntityOrder(recordsInVolume(world, volume, (record) => this.eligible(record, filter, true)))
  }

  point(at: Point3d, filter?: Filter): Entity[] {
    const world = this.worldNow()
    if (!world || !isPoint3d(at)) return []
    return this.inEntityOrder(recordsAtPoint(world, at, (record) => this.eligible(record, filter, true)))
  }

  nearest(at: Point3d, filter?: NearestFilter): Entity | null {
    const maxDistance = rangeOf(filter)
    if (!isPoint3d(at) || !(maxDistance >= 0)) return null
    let best: { entity: Entity; distance: number } | null = null
    for (const entity of this.game.entities) {
      const distance = this.distanceIfEligible(entity, { at, filter, maxDistance })
      if (distance !== null && (best === null || distance < best.distance)) best = { entity, distance }
    }
    return best?.entity ?? null
  }

  /** How far the entity is from the search, when it is alive, passes the filter and lies within range. */
  private distanceIfEligible(entity: Entity, { at, filter, maxDistance }: NearestSearch): number | null {
    if (!entity.alive || !this.rules.matchesCommon(entity, filter)) return null
    const { x, y, z } = entity.position
    const distance = Math.hypot(x - at.x, y - at.y, z - at.z)
    if (Number.isNaN(distance) || distance > maxDistance) return null
    return filter?.where && !filter.where(entity, { distance }) ? null : distance
  }

  /** The live world with its query structure current, or null while there is none. */
  private worldNow(): PhysicsWorld | null {
    const world = this.game.physics.world
    world?.refreshQueries()
    return world
  }

  /** A live entity's collider the query domain reads (solids for a ray, sensors for area and point) that passes the shared filter. */
  private eligible(record: BodyRecord, filter: Filter, sensors: boolean): boolean {
    return record.collider.sensor === sensors && record.entity.alive && this.rules.matches(record.entity, filter)
  }

  /** The entities of the records once each, in the order they were spawned. */
  private inEntityOrder(records: readonly BodyRecord[]): Entity[] {
    const found = new Set(records.map((record) => record.entity))
    return this.game.entities.filter((entity) => found.has(entity))
  }
}
