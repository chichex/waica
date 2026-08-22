import { GridMotor } from './grid-motor.js'

/** The four facings the top-down animation contract declares. */
export type TopDownFacing = 'n' | 's' | 'e' | 'w'

/**
 * Passive top-down motor: state code owns the frame and calls run() then
 * step(). Eight-direction input is normalized so diagonals match cardinal
 * speed; movement has no gravity and resolves each axis against Solids.
 */
export class TopDownMotor extends GridMotor<TopDownFacing> {
  static override componentName = 'TopDownMotor'

  /** Four-direction facing; starts looking at the camera. */
  override facing: TopDownFacing = 's'

  /**
   * Accelerates toward the input vector and lets the dominant raw input axis
   * select facing. Perfect ties preserve the previous facing.
   */
  run(inputX: number, inputY: number, dt: number): void {
    let x = inputX
    let y = inputY
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    this.accelerateToward(x, y, dt)

    const absX = Math.abs(inputX)
    const absY = Math.abs(inputY)
    if (absX > absY) this.facing = inputX < 0 ? 'w' : 'e'
    else if (absY > absX) this.facing = inputY < 0 ? 's' : 'n'
  }
}
