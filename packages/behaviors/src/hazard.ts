import { Component, type Entity } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor'
import { Respawnable } from './respawnable'

export type HazardTouch = 'stomp' | 'hurt'

/**
 * Touching a hazard by stomping it from above (falling, with the feet
 * above its center) squashes it; any other contact hurts.
 * Pure, so the decision is testable without the engine.
 */
export function resolveHazardTouch(
  playerVy: number,
  playerBottom: number,
  hazardY: number,
  stompable: boolean,
): HazardTouch {
  if (stompable && playerVy < 0 && playerBottom > hazardY) return 'stomp'
  return 'hurt'
}

/**
 * Hurts the player on contact. If stompable (Mario-style), stomping it
 * destroys it and bounces the player. Requires Hitbox on both entities.
 */
export class Hazard extends Component {
  static override componentName = 'Hazard'
  static override params = {
    bounce: { label: 'Stomp bounce', min: 0, max: 30, step: 0.5 },
  }

  stompable = true
  bounce = 10

  override onCollide(other: Entity): void {
    const motor = other.get(PlatformerMotor)
    if (!motor) return
    const playerBottom = other.position.y - motor.hitboxHeight / 2
    const touch = resolveHazardTouch(
      motor.vy,
      playerBottom,
      this.entity.position.y,
      this.stompable,
    )
    if (touch === 'stomp') {
      this.entity.destroy()
      motor.vy = this.bounce
    } else {
      other.get(Respawnable)?.respawn()
    }
  }
}
