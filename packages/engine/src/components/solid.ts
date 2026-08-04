import { Component } from '../component.js'
import {
  collisionBounds,
  resolveCollisionPoints,
  type CollisionPoint,
  type CollisionShape,
} from '../collision-shape.js'

/**
 * Static collider. Character motors (e.g. PlatformerMotor) collide against
 * every Solid in the scene.
 *
 * TODO(H1): general dynamic bodies via Rapier; genre character controllers
 * stay hand-rolled so their game feel remains deterministic.
 */
export class Solid extends Component {
  static override componentName = 'Solid'
  static override params = {
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
  }

  shape: CollisionShape = 'rectangle'
  width = 1
  height = 1
  offsetX = 0
  offsetY = 0
  /** Polygon vertices normalized against width/height. */
  points: CollisionPoint[] = resolveCollisionPoints(undefined)

  private get bounds() {
    return collisionBounds({
      x: this.entity.position.x + this.offsetX,
      y: this.entity.position.y + this.offsetY,
      width: this.width,
      height: this.height,
      shape: this.shape,
      points: this.points,
    })
  }

  get left(): number {
    return this.bounds.left
  }
  get right(): number {
    return this.bounds.right
  }
  get top(): number {
    return this.bounds.top
  }
  get bottom(): number {
    return this.bounds.bottom
  }
}
