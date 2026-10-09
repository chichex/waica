import type { BodyContact, Component } from '../component.js'
import type { Game } from '../game.js'
import type { BodyRecord } from './body-sync.js'
import type { PhysicsWorld } from './physics-world.js'
import type { RapierManifold } from './rapier-module.js'

/** Adds zero so a negated zero reads as 0, not -0. */
const clean = (value: number): number => value + 0

/** The contact one Rapier manifold makes for `record` against `other`, or null when it holds no solver contact point. */
function manifoldContact(sides: readonly [BodyRecord, BodyRecord], manifold: RapierManifold, flipped: boolean): BodyContact | null {
  const [record, other] = sides
  const point = manifold.numSolverContacts() > 0 ? manifold.solverContactPoint(0) : null
  if (!point) return null
  // The manifold's normal points from its first shape to its second; `flipped` says that first shape is ours.
  const n = manifold.normal()
  const sign = flipped ? -1 : 1
  return {
    entity: record.entity,
    other: other.entity,
    normal: { x: clean(sign * n.x), y: clean(sign * n.y), z: clean(sign * n.z) },
    point: { x: point.x, y: point.y, z: point.z },
  }
}

/** The solid contacts of one body this step, one per other entity, read from Rapier's narrow phase. */
function contactsOf(world: PhysicsWorld, record: BodyRecord): BodyContact[] {
  const contacts = new Map<BodyRecord, BodyContact>()
  world.raw.contactPairsWith(record.shape, (shape) => {
    const other = world.recordOfCollider(shape.handle)
    if (!other || other === record || contacts.has(other)) return
    world.raw.contactPair(record.shape, shape, (manifold, flipped) => {
      const contact = contacts.has(other) ? null : manifoldContact([record, other], manifold, flipped)
      if (contact) contacts.set(other, contact)
    })
  })
  return [...contacts.values()]
}

function deliver(contacts: readonly BodyContact[], receivers: readonly Component[]): void {
  for (const contact of contacts) {
    if (!contact.entity.alive || !contact.other.alive) continue
    for (const component of receivers) component.onBodyContact?.(contact)
  }
}

/**
 * After the physics step (CA-15): every component on an entity with a solid
 * Collider that implements `onBodyContact` hears about each other entity it
 * touches, once per step, with the normal pointing from it to the other.
 */
export function dispatchBodyContacts(game: Game, world: PhysicsWorld): void {
  for (const record of world.bodiesOf(game.entities)) {
    if (game.physics.world !== world) return
    if (record.collider.sensor || !record.entity.alive) continue
    const receivers = record.entity.components.filter((component) => typeof component.onBodyContact === 'function')
    if (receivers.length > 0) deliver(contactsOf(world, record), receivers)
  }
}
