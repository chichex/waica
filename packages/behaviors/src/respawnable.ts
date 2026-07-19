import { Component, THREE } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Remembers the spawn point and puts the entity back there on death
 * (falling off the world or touching a Hazard).
 */
export class Respawnable extends Component {
  static override componentName = 'Respawnable'
  static override params = {
    killY: { label: 'Kill height', min: -50, max: 0, step: 1 },
  }

  /** Falling below this height respawns. */
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
