import { Component, RigidBody } from '@waica/engine'

/**
 * Walks and jumps a 3D character (ADR 0028): beside a kinematic `RigidBody`
 * and its `Collider`, it turns the player's actions into the body's desired
 * velocity on the world axes and a jump. The engine's character controller
 * does the moving (walls, steps, slopes, gravity); this only asks. Movement is
 * relative to the world, not to the camera, and `-z` is forward. With no
 * kinematic body beside it, it does nothing (`validate_project` reports it).
 * Actions with no binding read 0, so a Game without bindings stands still.
 */
export class CharacterMotor extends Component {
  static override componentName = 'CharacterMotor'
  static override space = '3d' as const
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
    body.desiredVelocity = {
      x: input.axis(this.leftAction, this.rightAction) * this.speed,
      z: -input.axis(this.backAction, this.forwardAction) * this.speed,
    }
    if (!input.justPressed(this.jumpAction)) return
    body.jump(this.jumpSpeed)
    input.consume(this.jumpAction)
  }
}
