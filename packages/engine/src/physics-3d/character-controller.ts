import type { RigidBody } from '../components/rigid-body.js'
import { SIMULATION_STEP } from '../fixed-step.js'
import type { BodyRecord } from './body-sync.js'
import type { RapierCharacterController, RapierModule, RapierWorld } from './rapier-module.js'

/** The gap Rapier's controller keeps between the character and what it touches. */
const SKIN = 0.01
/** The narrowest ledge an autostep may land on. */
const MIN_STEP_WIDTH = 0.2
/** How far below the body the probe for the ground it stands on looks: past the skin, with room for a slope's slant. */
const GROUND_PROBE = SKIN * 4
const DOWN = { x: 0, y: -1, z: 0 }

const DEGREES = Math.PI / 180

/** The controller profile a RigidBody asks for, so the WASM calls that set it are skipped while it repeats. */
type Profile = `${number}/${number}/${number}`

const profileOf = (rigid: RigidBody): Profile => `${rigid.stepHeight}/${rigid.maxSlope}/${rigid.snapDistance}`

/**
 * Moves the kinematic bodies of a world through Rapier's character controller
 * (ADR 0028): one controller per world, tuned for each body from its
 * RigidBody before it moves. The controller applies no gravity, so the engine
 * integrates each body's vertical velocity here (inference 19, issue #159).
 */
export class CharacterMotion {
  private controller: RapierCharacterController | null = null
  private profile: Profile | null = null

  constructor(
    private readonly R: RapierModule,
    private readonly world: RapierWorld,
  ) {}

  /**
   * Puts every kinematic body where game code moved its entity since the last
   * step (a teleport), before any of them moves: the controller reads the
   * colliders' poses, which Rapier updates only inside a step, so they are
   * propagated here, and a teleported body starts over (no fall speed, not
   * grounded).
   */
  follow(records: Iterable<BodyRecord>): void {
    let teleported = false
    for (const record of records) {
      if (record.kind !== 'kinematic' || !this.followEntity(record)) continue
      teleported = true
      record.vy = 0
      record.grounded = false
    }
    if (teleported) this.world.propagateModifiedBodyPositionsToColliders()
  }

  /** Moves one kinematic body for this Simulation Step; Rapier applies the new position at `world.step()`. */
  move(record: BodyRecord): void {
    const { rigid, body, shape } = record
    if (!rigid) return
    // A body standing on the ground feels no gravity: pulling it into the floor every step makes it sink.
    if (!(record.grounded && record.vy <= 0)) record.vy += this.world.gravity.y * rigid.gravityScale * SIMULATION_STEP
    const desired = { x: rigid.desiredVelocity.x * SIMULATION_STEP, y: record.vy * SIMULATION_STEP, z: rigid.desiredVelocity.z * SIMULATION_STEP }
    const controller = this.tuned(rigid)
    controller.computeColliderMovement(shape, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS)
    const moved = controller.computedMovement()
    const at = body.translation()
    body.setNextKinematicTranslation({ x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z })
    record.grounded = controller.computedGrounded() && this.standsWithin(record, moved, rigid.maxSlope)
    record.velocity = { x: moved.x / SIMULATION_STEP, y: moved.y / SIMULATION_STEP, z: moved.z / SIMULATION_STEP }
    this.settleVertical(record, desired.y, moved.y)
  }

  /** Releases the controller; the world is freed right after. */
  free(): void {
    if (this.controller) this.world.removeCharacterController(this.controller)
    this.controller = null
    this.profile = null
  }

  /**
   * Whether what holds the body up, where this step leaves it, is ground it
   * may stand on: Rapier's `computedGrounded` counts any contact short of a
   * wall, `maxSlope` included or not, so a body would stand on, and jump off,
   * a slope it cannot climb. A short cast of its own collider straight down
   * finds the surface under it and its outward normal; ground is one within
   * `maxSlope` of up. On a steeper slope gravity keeps pulling the body down
   * it. (The controller records no collision for a resting contact, so the
   * movement's own collisions cannot tell the slope.)
   */
  private standsWithin({ shape }: BodyRecord, moved: { x: number; y: number; z: number }, maxSlope: number): boolean {
    const at = shape.translation()
    const next = { x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z }
    const flags = this.R.QueryFilterFlags.EXCLUDE_SENSORS
    const hit = this.world.castShape(next, shape.rotation(), DOWN, shape.shape, 0, GROUND_PROBE, true, flags, undefined, shape)
    return hit !== null && hit.normal1.y >= Math.cos(maxSlope * DEGREES)
  }

  /** The entity is where the body put it, unless game code moved it since: then the body goes there (a teleport). */
  private followEntity({ entity, body }: BodyRecord): boolean {
    const at = body.translation()
    const { x, y, z } = entity.position
    if (x === at.x && y === at.y && z === at.z) return false
    body.setTranslation({ x, y, z }, true)
    return true
  }

  /** After the move: standing ends a fall, and a ceiling ends a rise. */
  private settleVertical(record: BodyRecord, wanted: number, got: number): void {
    if (record.grounded && record.vy <= 0) record.vy = 0
    else if (record.vy > 0 && got < wanted / 2) record.vy = 0
  }

  private tuned(rigid: RigidBody): RapierCharacterController {
    const controller = (this.controller ??= this.created())
    const profile = profileOf(rigid)
    if (profile === this.profile) return controller
    this.profile = profile
    if (rigid.stepHeight > 0) controller.enableAutostep(rigid.stepHeight, MIN_STEP_WIDTH, true)
    else controller.disableAutostep()
    controller.setMaxSlopeClimbAngle(rigid.maxSlope * DEGREES)
    if (rigid.snapDistance > 0) controller.enableSnapToGround(rigid.snapDistance)
    else controller.disableSnapToGround()
    return controller
  }

  private created(): RapierCharacterController {
    const controller = this.world.createCharacterController(SKIN)
    controller.setUp({ x: 0, y: 1, z: 0 })
    controller.setApplyImpulsesToDynamicBodies(true)
    return controller
  }
}
