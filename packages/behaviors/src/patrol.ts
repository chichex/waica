import { Component } from '@waica/engine'

/**
 * Horizontal rail patrol: goes back and forth `distance` units from its
 * starting position, turning around at the ends (with a sprite flip).
 */
export class Patrol extends Component {
  static override componentName = 'Patrol'
  static override params = {
    distance: { label: 'Distance', min: 0.5, max: 20, step: 0.5 },
    speed: { label: 'Speed', min: 0.5, max: 15, step: 0.5 },
  }

  distance = 3
  speed = 2

  private originX = 0
  private dir = 1

  override onReady(): void {
    this.originX = this.entity.position.x
  }

  override onUpdate(dt: number): void {
    const pos = this.entity.position
    pos.x += this.dir * this.speed * dt
    if (pos.x > this.originX + this.distance) {
      pos.x = this.originX + this.distance
      this.dir = -1
    } else if (pos.x < this.originX - this.distance) {
      pos.x = this.originX - this.distance
      this.dir = 1
    }
    this.entity.scale.x = this.dir
  }
}
