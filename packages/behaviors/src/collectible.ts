import { Component, type Entity } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Se recoge al tocarlo el player (la entidad con PlatformerMovement):
 * dispara onCollect y se destruye. Requiere Hitbox en ambas entidades.
 */
export class Collectible extends Component {
  static override componentName = 'Collectible'
  static override params = {
    value: { label: 'Valor', min: 1, max: 100, step: 1 },
  }

  value = 1
  onCollect?: (value: number) => void

  override onCollide(other: Entity): void {
    if (!other.has(PlatformerMovement)) return
    this.onCollect?.(this.value)
    this.entity.destroy()
  }
}
