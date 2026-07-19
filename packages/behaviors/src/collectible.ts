import { Component, type Entity } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Collected when the player (the entity with PlatformerMovement) touches
 * it: fires onCollect and destroys itself. Requires Hitbox on both entities.
 */
export class Collectible extends Component {
  static override componentName = 'Collectible'
  static override params = {
    value: { label: 'Value', min: 1, max: 100, step: 1 },
  }

  value = 1
  onCollect?: (value: number) => void

  override onCollide(other: Entity): void {
    if (!other.has(PlatformerMovement)) return
    this.onCollect?.(this.value)
    this.game.events.emit('collect', this.value)
    this.entity.destroy()
  }
}
