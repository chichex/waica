import { Component, THREE } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Memoriza el punto de aparición y devuelve la entidad ahí al morir
 * (caerse del mundo o tocar un Hazard).
 */
export class Respawnable extends Component {
  static override componentName = 'Respawnable'
  static override params = {
    killY: { label: 'Altura de muerte', min: -50, max: 0, step: 1 },
  }

  /** Caer por debajo de esta altura respawnea. */
  killY = -12

  private spawn = new THREE.Vector3()

  override onReady(): void {
    this.spawn.copy(this.entity.position)
  }

  respawn(): void {
    this.entity.position.copy(this.spawn)
    const movement = this.entity.get(PlatformerMovement)
    if (movement) {
      movement.vx = 0
      movement.vy = 0
    }
  }

  override onUpdate(): void {
    if (this.entity.position.y < this.killY) this.respawn()
  }
}
