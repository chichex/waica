import {
  Component,
  resolveSolidAxis,
  screenInputToLogical,
  THREE,
  type AnimationFacingProvider,
  type CameraVelocity,
  type CameraVelocityProvider,
  type CollisionBody,
} from '@waica/engine'

/** The eight screen-relative facings declared by the isometric archetype. */
export type IsoFacing = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

function facingForInput(inputX: number, inputY: number): IsoFacing | undefined {
  if (inputX === 0 && inputY === 0) return undefined
  if (inputY > 0) {
    if (inputX > 0) return 'ne'
    if (inputX < 0) return 'nw'
    return 'n'
  }
  if (inputY < 0) {
    if (inputX > 0) return 'se'
    if (inputX < 0) return 'sw'
    return 's'
  }
  return inputX > 0 ? 'e' : 'w'
}

/**
 * Passive isometric motor. Input and facing are screen-relative while
 * velocity, integration and collision remain in logical square-grid space.
 * State code owns the frame and calls run() then step(); this component has
 * no onUpdate of its own.
 */
export class IsoMotor extends Component implements CameraVelocityProvider, AnimationFacingProvider {
  static override componentName = 'IsoMotor'
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
  walkThreshold = 0.5
  hitboxWidth = 0.9
  hitboxHeight = 0.6

  vx = 0
  vy = 0
  facing: IsoFacing = 's'

  getCameraVelocity(): CameraVelocity {
    return { vx: this.vx, vy: this.vy }
  }

  getAnimationFacing(): string {
    return this.facing
  }

  /** Accelerates screen-relative input toward a logical-space velocity. */
  run(inputX: number, inputY: number, dt: number): void {
    const direction = screenInputToLogical(inputX, inputY)
    const rateX = direction.x !== 0 ? this.acceleration : this.deceleration
    const rateY = direction.y !== 0 ? this.acceleration : this.deceleration
    this.vx = THREE.MathUtils.damp(
      this.vx,
      direction.x * this.moveSpeed,
      rateX / this.moveSpeed,
      dt,
    )
    this.vy = THREE.MathUtils.damp(
      this.vy,
      direction.y * this.moveSpeed,
      rateY / this.moveSpeed,
      dt,
    )
    this.facing = facingForInput(inputX, inputY) ?? this.facing
  }

  speed(): number {
    return Math.hypot(this.vx, this.vy)
  }

  /** Integrates and resolves each logical axis against every SolidSource. */
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
