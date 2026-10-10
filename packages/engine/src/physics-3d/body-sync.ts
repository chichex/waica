import type { Collider } from '../components/collider.js'
import { RIGID_BODY_TYPES, RigidBody } from '../components/rigid-body.js'
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
  /** Whether the Rapier collider was built as a sensor; frozen here because `Collider.sensor` is a plain field a script may flip later. */
  readonly sensor: boolean
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

const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

const isUnitInterval = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

/** Why this collider cannot become a Rapier shape, or null when it can. */
export function colliderProblem(collider: Collider): string | null {
  if (!isVec3(collider.offset)) return 'the offset needs three finite numbers'
  if (!isUnitInterval(collider.friction) || !isUnitInterval(collider.restitution)) return 'friction and restitution need numbers from 0 to 1'
  const problem = shapeProblem(collider)
  if (problem !== null) return problem
  // A shorter capsule would silently become a sphere of diameter 2 * radius, taller than the height declared.
  if (collider.shape === 'capsule' && collider.height < 2 * collider.radius) return 'a capsule needs a height of at least twice its radius'
  return null
}

const MIN_MASS = RigidBody.params.mass.min

/** Why this RigidBody cannot become a Rapier body, or null when it can (the mirror of `colliderProblem`). */
export function rigidBodyProblem(rigid: RigidBody): string | null {
  if (!RIGID_BODY_TYPES.includes(rigid.type)) return `type must be ${RIGID_BODY_TYPES.join(' or ')}; got ${JSON.stringify(rigid.type)}`
  if (!Number.isFinite(rigid.mass) || rigid.mass < MIN_MASS) return `mass must be at least ${MIN_MASS}`
  if (!Number.isFinite(rigid.gravityScale)) return 'gravityScale must be a finite number'
  for (const [name, value] of [['linearDamping', rigid.linearDamping], ['angularDamping', rigid.angularDamping]] as const) {
    if (!Number.isFinite(value) || value < 0) return `${name} must be at least 0`
  }
  if (!isVec3(rigid.velocity)) return 'velocity must be three finite numbers'
  return null
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
 * Which pairs Rapier computes contacts for. Its default leaves out every pair
 * with a kinematic body and no dynamic one, so a character standing on the
 * floor or against a wall would never hear `onBodyContact`: solid colliders
 * add the kinematic-fixed and kinematic-kinematic pairs on both sides. A
 * sensor on a fixed or kinematic body must still see the others (ALL leaves
 * fixed-fixed out).
 */
function activeCollisionTypes(R: RapierModule, sensor: boolean): number {
  const { ActiveCollisionTypes: types } = R
  return sensor ? types.ALL | types.FIXED_FIXED : types.DEFAULT | types.KINEMATIC_FIXED | types.KINEMATIC_KINEMATIC
}

/**
 * Builds the entity's body and collider from its components and puts them in
 * the world. Static bodies are created once and never follow the entity; a
 * dynamic body is Rapier's from here on. The caller has checked the parts
 * with `colliderProblem` and `rigidBodyProblem`.
 */
export function createBody(R: RapierModule, world: RapierWorld, parts: BodyParts): BodyRecord {
  const { entity, collider, rigid } = parts
  const scale = entity.scale
  const body = world.createRigidBody(bodyDesc(R, entity, rigid))
  const [ox, oy, oz] = collider.offset
  const desc = shapeDesc(R, collider, scale)
    .setTranslation(ox * scale.x, oy * scale.y, oz * scale.z)
    .setSensor(collider.sensor)
    .setFriction(collider.friction)
    .setRestitution(collider.restitution)
    .setActiveCollisionTypes(activeCollisionTypes(R, collider.sensor))
  if (rigid) desc.setMass(rigid.mass)
  const shape = world.createCollider(desc, body)
  return { entity, collider, rigid, kind: bodyKind(rigid), sensor: collider.sensor, body, shape, grounded: false }
}

/** After a step: a dynamic body's pose becomes its entity's (a sleeping body has not moved). */
export function syncDynamicBody(record: BodyRecord): void {
  if (record.kind !== 'dynamic' || record.body.isSleeping()) return
  const t = record.body.translation()
  const q = record.body.rotation()
  record.entity.position.set(t.x, t.y, t.z)
  record.entity.node.quaternion.set(q.x, q.y, q.z, q.w)
}
