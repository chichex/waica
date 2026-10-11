import { collisionMaskTargets } from '../collision-category.js'
import { Collider } from '../components/collider.js'
import type { Game } from '../game.js'
import type { BodyRecord } from './body-sync.js'
import type { PhysicsWorld } from './physics-world.js'

/** The mask a Collider has when nothing was declared: every layer. */
function isDefaultMask(mask: readonly string[]): boolean {
  return mask.length === 1 && mask[0] === '*'
}

/**
 * Whether `self` is notified about `target` (ADR 0016's directional
 * interest). A sensor always has an interest, its `collidesWith` (default
 * every layer), except that the default mask leaves out the level's fixed
 * solids: a 2D Hitbox never sees a Solid, so a pickup resting on the floor is
 * not told about the floor every step; naming their layer still works. A
 * solid collider has no interest until it declares a mask of its own
 * (inference 14, issue #159): the default `['*']` on a solid means "no
 * interest", so a wall or a character is not woken by every trigger it touches.
 */
function interestedIn(self: BodyRecord, target: BodyRecord): boolean {
  const { collider } = self
  const defaultMask = isDefaultMask(collider.collidesWith)
  if (!self.sensor && defaultMask) return false
  if (defaultMask && !target.sensor && target.kind === 'fixed') return false
  return collisionMaskTargets(collider.collidesWith, target.collider.layer)
}

type SensorPair = readonly [BodyRecord, BodyRecord]

/** Every sensor overlap of the world as a frozen snapshot: each pair once, the earlier-spawned sensor first. */
function sensorPairs(game: Game, world: PhysicsWorld): SensorPair[] {
  const records = world.bodiesOf(game.entities)
  const spawnIndex = new Map(records.map((record, index) => [record, index]))
  const spawnedBefore = (a: BodyRecord, b: BodyRecord): boolean => (spawnIndex.get(a) ?? 0) < (spawnIndex.get(b) ?? 0)
  const pairs: SensorPair[] = []
  for (const sensor of records.filter((record) => record.sensor)) {
    world.raw.intersectionPairsWith(sensor.shape, (shape) => {
      const other = world.recordOfCollider(shape.handle)
      if (!other || other === sensor) return
      // Two sensors see each other: the earlier one reports the pair.
      if (other.sensor && spawnedBefore(other, sensor)) return
      pairs.push([sensor, other])
    })
  }
  return pairs
}

/** Both entities of a snapshotted pair are alive and still carry the Collider it was taken from. */
function stillOverlapping([first, second]: SensorPair): boolean {
  return (
    first.entity.alive &&
    second.entity.alive &&
    first.entity.get(Collider) === first.collider &&
    second.entity.get(Collider) === second.collider
  )
}

/** `onCollide(other)` on every component of `self`'s entity, when its interest names `other`'s layer. */
function notify(self: BodyRecord, other: BodyRecord): void {
  if (!interestedIn(self, other)) return
  for (const component of [...self.entity.components]) component.onCollide?.(other.entity)
}

/**
 * The 3D counterpart of the Hitbox trigger dispatch (CA-16): after the physics
 * step, every overlap involving a sensor Collider fires `onCollide(other)` on
 * the components of each side whose interest names the other's layer, every
 * step while they overlap. Pairs are frozen first and each is re-checked live,
 * like the 2D dispatch.
 */
export function dispatchSensorCollisions(game: Game, world: PhysicsWorld): void {
  if (!world.hasSensors) return
  for (const pair of sensorPairs(game, world)) {
    if (!stillOverlapping(pair)) continue
    const [first, second] = pair
    notify(first, second)
    if (stillOverlapping(pair)) notify(second, first)
  }
}
