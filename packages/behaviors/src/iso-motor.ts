import { screenInputToLogical } from '@waica/engine'
import { GridMotor } from './grid-motor.js'

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
