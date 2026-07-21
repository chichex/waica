import { Component, type Entity } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor'

/**
 * Collected when the player (the entity with PlatformerMotor) touches
 * it: adds its value to a stat, fires onCollect and destroys itself.
 * Requires Hitbox on both entities.
 */
export class Collectible extends Component {
  static override componentName = 'Collectible'
  static override params = {
    value: { label: 'Value', min: 1, max: 100, step: 1 },
    stat: { label: 'Adds to stat' },
  }

  value = 1
  /** Stat receiving the value ('' collects without counting anywhere). */
  stat = 'points'
  onCollect?: (value: number) => void

  override onCollide(other: Entity): void {
    if (!other.has(PlatformerMotor)) return
    this.onCollect?.(this.value)
    if (this.stat) this.game.stats.add(this.stat, this.value)
    this.game.events.emit('collect', this.value)
    this.entity.destroy()
  }
}
