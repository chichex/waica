import { Component } from '../component.js'
import {
  resolveCollisionPoints,
  type CollisionPoint,
  type CollisionShape,
} from '../collision-shape.js'

/**
 * Trigger collider. A pair is tested when either Hitbox's Collision Mask
 * names the other's Collision Layer; only each interested owner receives
 * `onCollide`. Spatial Queries ignore categories. For static physical
 * collision see Solid.
 */
export class Hitbox extends Component {
  static override componentName = 'Hitbox'
  static override params = {
    layer: { label: 'Collision Layer' },
    collidesWith: { label: 'Collision Mask', kind: 'string-list' as const },
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
  }

  /** One exact, case-sensitive `^[a-z][a-z0-9-]*$` membership name. */
  layer = 'default'
  /** Outgoing layer interest; `'*'` means every valid layer and `[]` means none. */
  collidesWith: string[] = ['*']
  shape: CollisionShape = 'rectangle'
  width = 1
  height = 1
  offsetX = 0
  offsetY = 0
  /** Polygon vertices normalized against width/height. */
  points: CollisionPoint[] = resolveCollisionPoints(undefined)
}
