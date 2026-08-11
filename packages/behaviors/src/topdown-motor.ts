import {
  Component,
  resolveSolidAxis,
  THREE,
  type AnimationFacingProvider,
  type CameraVelocity,
  type CameraVelocityProvider,
  type CollisionBody,
} from '@waica/engine'

/** The four facings the top-down animation contract declares. */
export type TopDownFacing = 'n' | 's' | 'e' | 'w'

/**
 * Passive top-down motor: tuning params, physical state and movement
 * methods for state code to call. It has no onUpdate of its own — the
 * StateMachine is the only owner of the frame; this is the toolbox the
 * active state moves the body with. Eight-direction movement with the
 * input vector normalized so diagonals match cardinal speed, no gravity,
 * and per-axis collision against the scene's Solids — deterministic
 * genre movement (Zelda-style), not "realistic" physics.
 */
export class TopDownMotor extends Component implements CameraVelocityProvider, AnimationFacingProvider {
  static override componentName = 'TopDownMotor'
  static override displayName = 'Motor'
  static override params = {
    moveSpeed: { label: 'Speed', min: 1, max: 30, step: 0.5 },
    acceleration: { label: 'Acceleration', min: 5, max: 200, step: 5 },
    deceleration: { label: 'Deceleration', min: 5, max: 200, step: 5 },
    walkThreshold: { label: 'Walk threshold', min: 0, max: 5, step: 0.1 },
  }
  static override transient = ['vx', 'vy', 'facing']

  moveSpeed = 6
  acceleration = 60
  deceleration = 80
  /** Speed above this reads as walking (the idle ↔ walk edge). */
  walkThreshold = 0.5
  /** The character's AABB hitbox — a footprint, shorter than the sprite. */
  hitboxWidth = 0.9
  hitboxHeight = 0.6

  vx = 0
  vy = 0
  /** Four-direction facing; starts looking at the camera. */
  facing: TopDownFacing = 's'

  /** The scene camera reads follow velocity through this explicit seam. */
  getCameraVelocity(): CameraVelocity {
    return { vx: this.vx, vy: this.vy }
  }

  /** The StateMachine resolves directional clips through this explicit seam. */
  getAnimationFacing(): string {
    return this.facing
  }

  /**
   * Accelerates toward the input vector (each axis -1..1) * moveSpeed.
   * The vector is normalized so diagonals move at cardinal speed, and
   * facing follows the dominant input axis — ties keep the last facing.
   */
  run(inputX: number, inputY: number, dt: number): void {
    let x = inputX
    let y = inputY
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    const rateX = x !== 0 ? this.acceleration : this.deceleration
    const rateY = y !== 0 ? this.acceleration : this.deceleration
    this.vx = THREE.MathUtils.damp(this.vx, x * this.moveSpeed, rateX / this.moveSpeed, dt)
    this.vy = THREE.MathUtils.damp(this.vy, y * this.moveSpeed, rateY / this.moveSpeed, dt)
    const absX = Math.abs(inputX)
    const absY = Math.abs(inputY)
    if (absX > absY) this.facing = inputX < 0 ? 'w' : 'e'
    else if (absY > absX) this.facing = inputY < 0 ? 's' : 'n'
  }

  /** Live speed, for the idle ↔ walk edge. */
  speed(): number {
    return Math.hypot(this.vx, this.vy)
  }

  /** Integrates velocity and resolves each axis against Solids. */
  step(dt: number): void {
    const pos = this.entity.position
    const previousX = pos.x
    pos.x += this.vx * dt
    if (this.resolveAxis('x', previousX)) this.vx = 0
    const previousY = pos.y
    pos.y += this.vy * dt
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
