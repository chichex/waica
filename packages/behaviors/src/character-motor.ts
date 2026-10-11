import { Component, RigidBody, type ComponentSpace } from '@waica/engine'

/**
 * Walks and jumps a 3D character (ADR 0028): beside a kinematic `RigidBody`
 * and its `Collider`, it turns the player's actions into the body's desired
 * velocity on the world axes and a jump. The engine's character controller
 * does the moving (walls, steps, slopes, gravity); this only asks. Movement is
 * relative to the world, not to the camera, and `-z` is forward; a diagonal
 * is normalized, so it moves at `speed` like a cardinal direction. The jump
 * press is consumed only when the body jumped, so a press in the air stays
 * readable (a double jump, a glide). With no kinematic body beside it, it
 * does nothing (`validate_project` reports it). Actions with no binding read
 * 0, so a Game without bindings stands still.
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

  override onUpdate(): void {
    const body = this.entity.get(RigidBody)
    if (body?.type !== 'kinematic') return
    const { input } = this.game
    const x = input.axis(this.leftAction, this.rightAction)
    const z = -input.axis(this.backAction, this.forwardAction)
    // Like TopDownMotor: diagonals match the cardinal speed.
    const length = Math.hypot(x, z)
    const scale = length > 1 ? this.speed / length : this.speed
    body.desiredVelocity = { x: x * scale, z: z * scale }
    if (input.justPressed(this.jumpAction) && body.jump(this.jumpSpeed)) input.consume(this.jumpAction)
  }
}
