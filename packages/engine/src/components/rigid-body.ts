import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import type { Vec3Json } from '../scene-camera-3d.js'

export type RigidBodyType = 'dynamic' | 'kinematic'

export const RIGID_BODY_TYPES: readonly RigidBodyType[] = ['dynamic', 'kinematic']

/** A 3D vector as the body's public API reads and writes it. */
export interface BodyVector {
  x: number
  y: number
  z: number
}

const ZERO: Readonly<BodyVector> = { x: 0, y: 0, z: 0 }

/**
 * Makes the entity's `Collider` a body that moves (ADR 0028). A `dynamic` body
 * is Rapier's: it falls under the scene's gravity, bounces, stacks and rests,
 * and after every Simulation Step the engine writes the entity's position and
 * rotation from it. A `kinematic` body is moved by code. It needs a `Collider`
 * on the same entity (`validate_project` reports a body without one, and at
 * runtime none is created). `mass` is the collider's mass; `velocity` is the
 * initial linear velocity. A `kinematic` body is a character: every step the
 * engine moves it through Rapier's character controller by its
 * `desiredVelocity` on x and z and its own vertical velocity under gravity,
 * stopping at walls, climbing steps up to `stepHeight` and slopes up to
 * `maxSlope`, sticking to the ground within `snapDistance`, and pushing
 * dynamic bodies it walks into. A param outside its range (`type` unknown,
 * `mass` under the minimum, a `velocity` that is not three numbers) creates
 * no body and warns once; `validate_project` reports it as
 * `invalid-rigid-body-param`. A RigidBody in a 2D scene creates nothing.
 */
export class RigidBody extends Component {
  static override componentName = 'RigidBody'
  static override space: ComponentSpace = '3d'
  static override params = {
    type: { label: 'Type', options: [...RIGID_BODY_TYPES] },
    mass: { label: 'Mass', min: 0.001, step: 0.1 },
    gravityScale: { label: 'Gravity scale', step: 0.1 },
    linearDamping: { label: 'Linear damping', min: 0, step: 0.1 },
    angularDamping: { label: 'Angular damping', min: 0, step: 0.1 },
    lockRotations: { label: 'Lock rotations' },
    velocity: { label: 'Initial velocity', kind: 'vector3' },
    stepHeight: { label: 'Step height', min: 0, step: 0.05 },
    maxSlope: { label: 'Max slope (degrees)', min: 0, max: 89, step: 1 },
    snapDistance: { label: 'Snap to ground', min: 0, step: 0.05 },
  } satisfies Record<string, ParamSpec>
  // Live reads and writes of the body, not authorable defaults (they need a Game to answer).
  static override transient = ['linearVelocity', 'desiredVelocity']

  type: RigidBodyType = 'dynamic'
  mass = 1
  gravityScale = 1
  linearDamping = 0
  angularDamping = 0
  lockRotations = false
  /** The initial linear velocity `[x, y, z]`, applied when the body is created. */
  velocity: Vec3Json = [0, 0, 0]
  /** Kinematic only: the tallest step it climbs without jumping. */
  stepHeight = 0.3
  /** Kinematic only: the steepest slope it climbs, in degrees. */
  maxSlope = 45
  /** Kinematic only: how far below its feet it still sticks to the ground (walking down steps and slopes). */
  snapDistance = 0.2
  /**
   * Kinematic only: where it walks, in units per second on the world x and z
   * axes. A motor sets it; the physics step reads it every Simulation Step and
   * moves the body through the character controller. It stays until set again.
   */
  desiredVelocity = { x: 0, z: 0 }

  /** The body's linear velocity now, in units per second; zero before it exists. Assigning sets it. */
  get linearVelocity(): BodyVector {
    return this.game.physics.velocityOf(this.entity) ?? { ...ZERO }
  }
  set linearVelocity(value: BodyVector) {
    this.game.physics.setVelocityOf(this.entity, value)
  }

  /** Launches a kinematic body upward at `speed` (units per second), only while it stands on something; whether it did. */
  jump(speed: number): boolean {
    return this.game.physics.jumpOf(this.entity, speed)
  }

  /** Whether the body stands on something; only a kinematic body moved by the character controller can. */
  get grounded(): boolean {
    return this.game.physics.groundedOf(this.entity)
  }

  /** Pushes a dynamic body with an instantaneous impulse (mass · velocity change); a no-op on any other body. */
  applyImpulse(impulse: BodyVector): void {
    this.game.physics.applyImpulseTo(this.entity, impulse)
  }

  override onReady(): void {
    this.game.physics.attach(this.entity)
  }

  override onDestroy(): void {
    this.game.physics.detach(this.entity)
  }
}
