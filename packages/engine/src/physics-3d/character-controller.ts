import type { RigidBody } from '../components/rigid-body.js'
import { SIMULATION_STEP } from '../fixed-step.js'
import type { BodyRecord } from './body-sync.js'
import type { RapierCharacterController, RapierModule, RapierWorld } from './rapier-module.js'

/** The gap Rapier's controller keeps between the character and what it touches. */
const SKIN = 0.01
/** The narrowest ledge an autostep may land on. */
const MIN_STEP_WIDTH = 0.2

const DEGREES = Math.PI / 180

/**
 * Moves the kinematic bodies of a world through Rapier's character controller
 * (ADR 0028): one controller per world, tuned for each body from its
 * RigidBody before it moves. The controller applies no gravity, so the engine
 * integrates each body's vertical velocity here (inference 19, issue #159).
 */
export class CharacterMotion {
  private controller: RapierCharacterController | null = null

  constructor(
    private readonly R: RapierModule,
    private readonly world: RapierWorld,
  ) {}

  /** Moves one kinematic body for this Simulation Step; Rapier applies the new position at `world.step()`. */
  move(record: BodyRecord): void {
    const { rigid, body, shape } = record
    if (!rigid) return
    this.followEntity(record)
    // A body standing on the ground feels no gravity: pulling it into the floor every step makes it sink.
    if (!(record.grounded && record.vy <= 0)) record.vy += this.world.gravity.y * rigid.gravityScale * SIMULATION_STEP
    const desired = { x: rigid.desiredVelocity.x * SIMULATION_STEP, y: record.vy * SIMULATION_STEP, z: rigid.desiredVelocity.z * SIMULATION_STEP }
    const controller = this.tuned(rigid)
    controller.computeColliderMovement(shape, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS)
    const moved = controller.computedMovement()
    const at = body.translation()
    body.setNextKinematicTranslation({ x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z })
    record.grounded = controller.computedGrounded()
    record.velocity = { x: moved.x / SIMULATION_STEP, y: moved.y / SIMULATION_STEP, z: moved.z / SIMULATION_STEP }
    this.settleVertical(record, desired.y, moved.y)
  }

  /** Releases the controller; the world is freed right after. */
  free(): void {
    if (this.controller) this.world.removeCharacterController(this.controller)
    this.controller = null
  }

  /** The entity is where the body put it, unless game code moved it since: then the body goes there (a teleport). */
  private followEntity({ entity, body }: BodyRecord): void {
    const at = body.translation()
    const { x, y, z } = entity.position
    if (x !== at.x || y !== at.y || z !== at.z) body.setTranslation({ x, y, z }, true)
  }

  /** After the move: standing ends a fall, and a ceiling ends a rise. */
  private settleVertical(record: BodyRecord, wanted: number, got: number): void {
    if (record.grounded && record.vy <= 0) record.vy = 0
    else if (record.vy > 0 && got < wanted / 2) record.vy = 0
  }

  private tuned(rigid: RigidBody): RapierCharacterController {
    const controller = (this.controller ??= this.created())
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
