import { Component } from '@waica/engine'

/**
 * Patrulla horizontal en riel: va y vuelve `distance` unidades desde su
 * posición inicial, dándose vuelta en los extremos (con flip de sprite).
 */
export class Patrol extends Component {
  static override componentName = 'Patrol'
  static override params = {
    distance: { label: 'Distancia', min: 0.5, max: 20, step: 0.5 },
    speed: { label: 'Velocidad', min: 0.5, max: 15, step: 0.5 },
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
