import { Component, type Entity } from '@waica/engine'

/**
 * Collected when its Hitbox mask dispatches an overlap: adds its value to a
 * stat, fires onCollect and destroys itself. Shipped collectibles target the
 * `player` layer; this handler deliberately does not recheck identity.
 */
export class Collectible extends Component {
  static override componentName = 'Collectible'
  static override params = {
    value: { label: 'Value', min: 1, max: 100, step: 1 },
    stat: { label: 'Adds to stat', ref: 'stat' as const },
  }

  value = 1
  /** Stat receiving the value ('' collects without counting anywhere). */
  stat = 'points'
  onCollect?: (value: number) => void

  override onCollide(_other: Entity): void {
    this.onCollect?.(this.value)
    if (this.stat) this.game.stats.add(this.stat, this.value)
    this.game.events.emit('collect', this.value)
    this.entity.destroy()
  }
}
