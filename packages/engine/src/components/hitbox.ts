import { Component } from '../component.js'
import {
  resolveCollisionPoints,
  type CollisionPoint,
  type CollisionShape,
} from '../collision-shape.js'

/**
 * Trigger collider: the Game detects overlaps between Hitboxes and calls
 * onCollide(other) on both entities' components. For static physical
 * collision see Solid.
 */
export class Hitbox extends Component {
  static override componentName = 'Hitbox'
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
}
