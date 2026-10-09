import type { Collider } from '../components/collider.js'
import type { RigidBody } from '../components/rigid-body.js'
import type { Entity } from '../entity.js'
import type { RapierBody, RapierCollider, RapierColliderDesc, RapierModule, RapierWorld } from './rapier-module.js'

/** Rapier's three body types, as the Runtime Snapshot names them. */
export type BodyKind = 'fixed' | 'dynamic' | 'kinematic'

/** What a body is built from: the entity and the Collider and RigidBody components it has. */
export interface BodyParts {
  readonly entity: Entity
  readonly collider: Collider
  readonly rigid: RigidBody | null
}

/** One entity's body in the world: its components and the Rapier handles built from them. */
export interface BodyRecord {
  readonly entity: Entity
  readonly collider: Collider
  readonly rigid: RigidBody | null
  readonly kind: BodyKind
  readonly body: RapierBody
  readonly shape: RapierCollider
  /** Whether a kinematic body stands on something after the last step; written by the character controller. */
  grounded: boolean
}

/** The dimensions a collider needs are positive finite numbers (Rapier does not defend itself against anything else). */
function positive(...values: number[]): boolean {
  return values.every((value) => Number.isFinite(value) && value > 0)
}

function shapeProblem(collider: Collider): string | null {
  switch (collider.shape) {
    case 'box':
      return Array.isArray(collider.size) && collider.size.length === 3 && positive(...collider.size)
        ? null
        : 'a box needs a size of three positive numbers'
    case 'sphere':
      return positive(collider.radius) ? null : 'a sphere needs a positive radius'
    case 'capsule':
      return positive(collider.radius, collider.height) ? null : 'a capsule needs a positive radius and height'
    default:
      return `unknown shape "${String(collider.shape)}"`
  }
}

/** Why this collider cannot become a Rapier shape, or null when it can. */
export function colliderProblem(collider: Collider): string | null {
  const { offset } = collider
  if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(Number.isFinite)) return 'the offset needs three finite numbers'
  return shapeProblem(collider)
}

/**
 * The Rapier shape of a collider at the entity's current scale (inference 9,
 * issue #159): a box's size and a capsule's height scale per axis, a sphere's
 * radius by the largest axis, a capsule's radius by the larger of x and z.
 * A capsule's `height` is end to end, so its straight part is the rest.
 */
function shapeDesc(R: RapierModule, collider: Collider, scale: { x: number; y: number; z: number }): RapierColliderDesc {
  const [sx, sy, sz] = [Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)]
  switch (collider.shape) {
    case 'sphere':
      return R.ColliderDesc.ball(collider.radius * Math.max(sx, sy, sz))
    case 'capsule': {
      const radius = collider.radius * Math.max(sx, sz)
      return R.ColliderDesc.capsule(Math.max(0, (collider.height * sy) / 2 - radius), radius)
    }
    case 'box': {
      const [x, y, z] = collider.size
      return R.ColliderDesc.cuboid((x * sx) / 2, (y * sy) / 2, (z * sz) / 2)
    }
  }
}

function bodyKind(rigid: RigidBody | null): BodyKind {
  if (!rigid) return 'fixed'
  return rigid.type === 'kinematic' ? 'kinematic' : 'dynamic'
}

function bodyDesc(R: RapierModule, entity: Entity, rigid: RigidBody | null) {
  const kind = bodyKind(rigid)
  const desc =
    kind === 'dynamic' ? R.RigidBodyDesc.dynamic() : kind === 'kinematic' ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed()
  const { x, y, z } = entity.position
  const q = entity.node.quaternion
  desc.setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
  if (kind === 'dynamic' && rigid) {
    const [vx, vy, vz] = rigid.velocity
    desc
      .setGravityScale(rigid.gravityScale)
      .setLinearDamping(rigid.linearDamping)
      .setAngularDamping(rigid.angularDamping)
      .setLinvel(vx, vy, vz)
    if (rigid.lockRotations) desc.lockRotations()
  }
  if (kind === 'kinematic') desc.lockRotations()
  return desc
}

/**
 * Builds the entity's body and collider from its components and puts them in
 * the world. Static bodies are created once and never follow the entity; a
 * dynamic body is Rapier's from here on. A collider whose dimensions Rapier
 * cannot take returns null (one warning is logged by the caller).
 */
export function createBody(R: RapierModule, world: RapierWorld, parts: BodyParts): BodyRecord | null {
  const { entity, collider, rigid } = parts
  if (colliderProblem(collider) !== null) return null
  const scale = entity.scale
  const body = world.createRigidBody(bodyDesc(R, entity, rigid))
  const [ox, oy, oz] = collider.offset
  const desc = shapeDesc(R, collider, scale)
    .setTranslation(ox * scale.x, oy * scale.y, oz * scale.z)
    .setSensor(collider.sensor)
    .setFriction(collider.friction)
    .setRestitution(collider.restitution)
  // A sensor on a fixed or kinematic body must still see the others (Rapier's default skips those pairs; its ALL leaves fixed-fixed out).
  if (collider.sensor) desc.setActiveCollisionTypes(R.ActiveCollisionTypes.ALL | R.ActiveCollisionTypes.FIXED_FIXED)
  if (rigid) desc.setMass(rigid.mass)
  const shape = world.createCollider(desc, body)
  return { entity, collider, rigid, kind: bodyKind(rigid), body, shape, grounded: false }
}

/** After a step: a dynamic body's pose becomes its entity's (a sleeping body has not moved). */
export function syncDynamicBody(record: BodyRecord): void {
  if (record.kind !== 'dynamic' || record.body.isSleeping()) return
  const t = record.body.translation()
  const q = record.body.rotation()
  record.entity.position.set(t.x, t.y, t.z)
  record.entity.node.quaternion.set(q.x, q.y, q.z, q.w)
}
