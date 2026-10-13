import { Component, type Entity } from '@waica/engine'
import { isPlayer } from './player-identity.js'
import { Respawnable } from './respawnable.js'

/**
 * A place the player comes back to (issue #181 CA-21, D-3). When the player
 * overlaps this entity's trigger — a sensor Collider in 3D, a Hitbox in 2D —
 * it becomes the active checkpoint, every other one turns inactive, and the
 * player's Respawnable respawns at this entity's position from then on.
 * Runs in both spaces.
 */
export class Checkpoint extends Component {
  static override componentName = 'Checkpoint'

  /** True for the checkpoint the player touched last. */
  active = false

  override onCollide(other: Entity): void {
    if (this.active || !isPlayer(other)) return
    for (const entity of this.game.entities) {
      const checkpoint = entity.get(Checkpoint)
      if (checkpoint && checkpoint !== this) checkpoint.active = false
    }
    this.active = true
    other.get(Respawnable)?.setSpawn(this.entity.position)
  }
}
