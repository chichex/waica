import { Component, RigidBody, type ComponentSpace } from '@waica/engine'
import { turnYawToward } from './facing-3d.js'

/**
 * Walks and jumps a 3D character (ADR 0028): beside a kinematic `RigidBody`
 * and its `Collider`, it turns the player's actions into the body's desired
 * velocity on the world axes and a jump. The engine's character controller
 * does the moving (walls, steps, slopes, gravity); this only asks. Movement is
 * relative to the world, not to the camera, and `-z` is forward; a diagonal
 * is normalized, so it moves at `speed` like a cardinal direction. The jump
 * press is consumed only when the body jumped, so a press in the air stays
 * readable (a double jump, a glide). It also faces where it walks (issue
 * #166 CA-14): each step with a non-zero desired velocity turns the entity's
 * yaw toward it by at most `turnSpeed` degrees per second (0 snaps); with no
 * input, or a `speed` of 0, the yaw holds. The body is unaffected: a
 * kinematic body keeps the rotation it spawned with, so give it a Collider
 * that looks the same from every side — a capsule or a sphere with no x/z
 * `offset` — or the turned model and a box or offset collider disagree about
 * where the character ends. With no kinematic body beside it, it does nothing
 * (`validate_project` reports it). Actions with no binding read 0, so a Game
 * without bindings stands still.
 */
export class CharacterMotor extends Component {
  static override componentName = 'CharacterMotor'
  static override space: ComponentSpace = '3d'
  static override params = {
    speed: { label: 'Speed', min: 0, max: 30, step: 0.5 },
    jumpSpeed: { label: 'Jump speed', min: 0, max: 30, step: 0.5 },
    leftAction: { label: 'Left action' },
    rightAction: { label: 'Right action' },
    forwardAction: { label: 'Forward action' },
    backAction: { label: 'Back action' },
    jumpAction: { label: 'Jump action' },
    turnSpeed: { label: 'Turn speed (deg/s)', min: 0, max: 1440, step: 30 },
  }

  /** Walking speed in units per second. */
  speed = 6
  /** Launch speed of a jump in units per second. */
  jumpSpeed = 6
  leftAction = 'left'
  rightAction = 'right'
  /** Walks toward -z. */
  forwardAction = 'up'
  /** Walks toward +z. */
  backAction = 'down'
  jumpAction = 'jump'
  /** How fast it turns to face its walk, in degrees per second; 0 snaps. */
  turnSpeed = 540

  override onUpdate(dt: number): void {
    const body = this.entity.get(RigidBody)
    if (body?.type !== 'kinematic') return
    const { input } = this.game
    const x = input.axis(this.leftAction, this.rightAction)
    const z = -input.axis(this.backAction, this.forwardAction)
    // Like TopDownMotor: diagonals match the cardinal speed.
    const length = Math.hypot(x, z)
    const scale = length > 1 ? this.speed / length : this.speed
    body.desiredVelocity = { x: x * scale, z: z * scale }
    // Toward the velocity it asked for, not the raw input: a speed of 0 walks nowhere and turns nowhere.
    turnYawToward(this.entity.node, body.desiredVelocity.x, body.desiredVelocity.z, this.turnSpeed, dt)
    if (input.justPressed(this.jumpAction) && body.jump(this.jumpSpeed)) input.consume(this.jumpAction)
  }
}
