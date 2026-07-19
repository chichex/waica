import { Component, type Entity } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'
import { Respawnable } from './respawnable'

export type HazardTouch = 'stomp' | 'hurt'

/**
 * Al tocar un hazard pisándolo desde arriba (cayendo, con los pies por
 * encima de su centro) se aplasta; cualquier otro contacto lastima.
 * Pura, para testear la decisión sin motor.
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
 * Daña al player al contacto. Si es stompable (Mario-style), pisarlo lo
 * destruye y rebota al player. Requiere Hitbox en ambas entidades.
 */
export class Hazard extends Component {
  static override componentName = 'Hazard'
  static override params = {
    bounce: { label: 'Rebote al pisar', min: 0, max: 30, step: 0.5 },
  }

  stompable = true
  bounce = 10

  override onCollide(other: Entity): void {
    const movement = other.get(PlatformerMovement)
    if (!movement) return
    const playerBottom = other.position.y - movement.hitboxHeight / 2
    const touch = resolveHazardTouch(
      movement.vy,
      playerBottom,
      this.entity.position.y,
      this.stompable,
    )
    if (touch === 'stomp') {
      this.entity.destroy()
      movement.vy = this.bounce
    } else {
      other.get(Respawnable)?.respawn()
    }
  }
}
