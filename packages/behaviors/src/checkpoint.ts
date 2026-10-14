import { Component, THREE, type Entity, type ParamSpec, type Vec3Json } from '@waica/engine'
import { isPlayer } from './player-identity.js'
import { Respawnable } from './respawnable.js'

/**
 * A place the player comes back to (issue #181 CA-21, D-3). When the player
 * overlaps this entity's trigger — a sensor Collider in 3D, a Hitbox in 2D —
 * it becomes the active checkpoint, every other one turns inactive, and the
 * player's Respawnable respawns at this entity's position — moved by
 * `spawnOffset` in its local frame — from then on. Runs in both spaces.
 */
export class Checkpoint extends Component {
  static override componentName = 'Checkpoint'
  static override transient = ['active']
  static override params = {
    spawnOffset: { label: 'Spawn offset', kind: 'vector3' },
  } satisfies Record<string, ParamSpec>

  /** True for the checkpoint the player touched last. */
  active = false
  /**
   * Where the player respawns, in this entity's local frame (turned and
   * scaled with it, like a Collider's offset): a banner hung on a wall keeps
   * its origin on the wall and its spawn on the floor in front of it.
   */
  spawnOffset: Vec3Json = [0, 0, 0]

  override onCollide(other: Entity): void {
    if (this.active || !isPlayer(other)) return
    for (const entity of this.game.entities) {
      const checkpoint = entity.get(Checkpoint)
      if (checkpoint && checkpoint !== this) checkpoint.active = false
    }
    this.active = true
    other.get(Respawnable)?.setSpawn(this.spawnPoint())
  }

  /** This entity's position plus its spawnOffset, turned and scaled by its node. */
  private spawnPoint(): THREE.Vector3 {
    const [x, y, z] = this.spawnOffset
    const { node } = this.entity
    return new THREE.Vector3(x, y, z).multiply(node.scale).applyQuaternion(node.quaternion).add(this.entity.position)
  }
}
