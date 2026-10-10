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
 * initial linear velocity. A param outside its range (`type` unknown, `mass`
 * under the minimum, a `velocity` that is not three numbers) creates no body
 * and warns once; `validate_project` reports it as `invalid-rigid-body-param`.
 * A RigidBody in a 2D scene creates nothing.
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
  } satisfies Record<string, ParamSpec>
  // A live read of the body, not an authorable default (it needs a Game to answer).
  static override transient = ['linearVelocity']

  type: RigidBodyType = 'dynamic'
  mass = 1
  gravityScale = 1
  linearDamping = 0
  angularDamping = 0
  lockRotations = false
  /** The initial linear velocity `[x, y, z]`, applied when the body is created. */
  velocity: Vec3Json = [0, 0, 0]

  /** The body's linear velocity now, in units per second; zero before it exists. Assigning sets it. */
  get linearVelocity(): BodyVector {
    return this.game.physics.velocityOf(this.entity) ?? { ...ZERO }
  }
  set linearVelocity(value: BodyVector) {
    this.game.physics.setVelocityOf(this.entity, value)
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
