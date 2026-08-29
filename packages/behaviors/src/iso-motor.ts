import { screenInputToLogical } from '@waica/engine'
import { facingForInput, type ScreenFacing } from './facing.js'
import { GridMotor } from './grid-motor.js'

/** The eight screen-relative facings declared by the isometric archetype. */
export type IsoFacing = ScreenFacing

/**
 * Passive isometric motor. Input and facing are screen-relative while the
 * shared GridMotor integrates and collides in logical square-grid space.
 * State code owns the frame; this component has no onUpdate of its own.
 */
export class IsoMotor extends GridMotor<IsoFacing> {
  static override componentName = 'IsoMotor'

  override facing: IsoFacing = 's'

  /** Accelerates screen-relative input toward a logical-space velocity. */
  run(inputX: number, inputY: number, dt: number): void {
    const direction = screenInputToLogical(inputX, inputY)
    this.accelerateToward(direction.x, direction.y, dt)
    this.facing = facingForInput(inputX, inputY) ?? this.facing
  }
}
