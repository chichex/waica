import {
  Component,
  resolveSolidAxis,
  THREE,
  type AnimationFacingProvider,
  type CameraVelocity,
  type CameraVelocityProvider,
  type CollisionBody,
} from '@waica/engine'

/** Shared velocity, collision and provider behavior for square-grid motors. */
export abstract class GridMotor<Facing extends string>
  extends Component
  implements CameraVelocityProvider, AnimationFacingProvider
{
  static override displayName = 'Motor'
  static override params = {
    moveSpeed: { label: 'Speed', min: 1, max: 30, step: 0.5 },
    acceleration: { label: 'Acceleration', min: 5, max: 200, step: 5 },
    deceleration: { label: 'Deceleration', min: 5, max: 200, step: 5 },
    walkThreshold: { label: 'Walk threshold', min: 0, max: 5, step: 0.1 },
    knockbackSpeed: { label: 'Knockback speed', min: 0, max: 30, step: 0.5 },
  }
  static override transient = ['vx', 'vy', 'facing']

  moveSpeed = 6
  acceleration = 60
  deceleration = 80
  /** Speed above this reads as walking (the idle ↔ walk edge). */
  walkThreshold = 0.5
  /** How hard a hit shoves the body away from its source (the hurt state). */
  knockbackSpeed = 8
  /** The character's AABB hitbox — a footprint, shorter than the sprite. */
  hitboxWidth = 0.9
  hitboxHeight = 0.6

  vx = 0
  vy = 0
  abstract facing: Facing

  /** The scene camera reads follow velocity through this explicit seam. */
  getCameraVelocity(): CameraVelocity {
    return { vx: this.vx, vy: this.vy }
  }

  /** The StateMachine resolves directional clips through this explicit seam. */
  getAnimationFacing(): string {
    return this.facing
  }

  /** Accelerates each axis toward an already-normalized logical direction. */
  protected accelerateToward(x: number, y: number, dt: number): void {
    const rateX = x !== 0 ? this.acceleration : this.deceleration
    const rateY = y !== 0 ? this.acceleration : this.deceleration
    this.vx = THREE.MathUtils.damp(this.vx, x * this.moveSpeed, rateX / this.moveSpeed, dt)
    this.vy = THREE.MathUtils.damp(this.vy, y * this.moveSpeed, rateY / this.moveSpeed, dt)
  }

  /** Live speed, for the idle ↔ walk edge. */
  speed(): number {
    return Math.hypot(this.vx, this.vy)
  }

  /** Integrates velocity and resolves each logical axis against Solids. */
  step(dt: number): void {
    const position = this.entity.position
    const previousX = position.x
    position.x += this.vx * dt
    if (this.resolveAxis('x', previousX)) this.vx = 0

    const previousY = position.y
    position.y += this.vy * dt
    if (this.resolveAxis('y', previousY)) this.vy = 0
  }

  halt(): void {
    this.vx = 0
    this.vy = 0
  }

  private resolveAxis(axis: 'x' | 'y', previous: number): boolean {
    return resolveSolidAxis({
      entity: this.entity,
      axis,
      previous,
      body: () => this.collisionBody(),
    })
  }

  private collisionBody(): CollisionBody {
    return {
      x: this.entity.position.x,
      y: this.entity.position.y,
      width: this.hitboxWidth,
      height: this.hitboxHeight,
      shape: 'rectangle',
    }
  }
}
