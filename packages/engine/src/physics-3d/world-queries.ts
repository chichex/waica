import type { BodyRecord } from './body-sync.js'
import type { PhysicsWorld } from './physics-world.js'
import type { RapierCollider } from './rapier-module.js'

/** A point or a direction in world space, as `game.query` takes and returns it. */
export interface Point3d {
  x: number
  y: number
  z: number
}

/** A volume `game.query.area` tests sensor colliders against. */
export type QueryVolume3d =
  | { shape: 'box'; center: Point3d; size: Point3d }
  | { shape: 'sphere'; center: Point3d; radius: number }

/** One collider a ray reaches: whose it is, how far, where and which way its surface faces. */
export interface WorldRayHit {
  record: BodyRecord
  distance: number
  point: Point3d
  normal: Point3d
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }

/**
 * Rapier's predicate for a query: only colliders whose body record `accepts`.
 * It runs inside Rapier's borrow of the world, so `accepts` must be a plain
 * read of the record (the domain, liveness, the structural filter); game code
 * such as a `where` predicate runs afterwards, on the collected records.
 */
function accepting(world: PhysicsWorld, accepts: (record: BodyRecord) => boolean): (collider: RapierCollider) => boolean {
  return (collider) => {
    const record = world.recordOfCollider(collider.handle)
    return record !== undefined && accepts(record)
  }
}

/**
 * Every collider along a ray whose record `accepts`, nearest first.
 * `direction` is a unit vector, so the distance is in world units; an origin
 * inside a collider hits it at distance 0.
 */
export function worldRayHits(
  world: PhysicsWorld,
  ray: { origin: Point3d; direction: Point3d; maxDistance: number },
  accepts: (record: BodyRecord) => boolean,
): WorldRayHit[] {
  const { R, raw } = world
  const { origin, direction } = ray
  const hits: WorldRayHit[] = []
  raw.intersectionsWithRay(
    new R.Ray(origin, direction),
    ray.maxDistance,
    true,
    (hit) => {
      const record = world.recordOfCollider(hit.collider.handle)
      const distance = hit.timeOfImpact
      if (record) {
        hits.push({
          record,
          distance,
          point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance },
          normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        })
      }
      return true
    },
    undefined,
    undefined,
    undefined,
    undefined,
    accepting(world, accepts),
  )
  return hits.sort((a, b) => a.distance - b.distance)
}

/** Every record whose collider `accepts` and that intersects the volume. */
export function recordsInVolume(world: PhysicsWorld, volume: QueryVolume3d, accepts: (record: BodyRecord) => boolean): BodyRecord[] {
  const { R, raw } = world
  const shape =
    volume.shape === 'box'
      ? new R.Cuboid(volume.size.x / 2, volume.size.y / 2, volume.size.z / 2)
      : new R.Ball(volume.radius)
  const found: BodyRecord[] = []
  raw.intersectionsWithShape(
    volume.center,
    IDENTITY,
    shape,
    (collider) => {
      const record = world.recordOfCollider(collider.handle)
      if (record) found.push(record)
      return true
    },
    undefined,
    undefined,
    undefined,
    undefined,
    accepting(world, accepts),
  )
  return found
}

/** Every record whose collider `accepts` and that contains the point. */
export function recordsAtPoint(world: PhysicsWorld, at: Point3d, accepts: (record: BodyRecord) => boolean): BodyRecord[] {
  const found: BodyRecord[] = []
  world.raw.intersectionsWithPoint(
    at,
    (collider) => {
      const record = world.recordOfCollider(collider.handle)
      if (record) found.push(record)
      return true
    },
    undefined,
    undefined,
    undefined,
    undefined,
    accepting(world, accepts),
  )
  return found
}
