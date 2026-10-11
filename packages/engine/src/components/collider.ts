import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import type { Vec3Json } from '../scene-camera-3d.js'

export type ColliderShape = 'box' | 'sphere' | 'capsule'

export const COLLIDER_SHAPES: readonly ColliderShape[] = ['box', 'sphere', 'capsule']

/**
 * The 3D scene's collision shape (ADR 0028), Rapier's model: alone on an
 * entity it is a fixed wall or floor, created at the entity's position and
 * rotation scaled by `entity.scale`, and moving the entity later does not
 * move it. With a `RigidBody` beside it, it is the body that falls, bounces
 * or walks. `sensor: true` makes it a trigger instead — it detects and never
 * pushes — with the 2D Hitbox's `layer` and `collidesWith` semantics (ADR
 * 0016); with the default mask (`['*']`) a sensor is not told about fixed
 * solid colliders (the level's walls and floors), as a Hitbox never sees a
 * Solid — a mask that names their layer still is. `size` is a box's full
 * extents; `radius` a sphere's or capsule's; `height` a capsule's total
 * end-to-end height, at least twice its radius; `offset` is in the entity's
 * local frame. A Collider in a 2D scene creates nothing; one whose params
 * Rapier cannot take creates no body and warns once (`validate_project`
 * reports them as `invalid-collider-param`).
 */
export class Collider extends Component {
  static override componentName = 'Collider'
  static override space: ComponentSpace = '3d'
  static override params = {
    shape: { label: 'Shape', options: [...COLLIDER_SHAPES] },
    size: { label: 'Size', kind: 'vector3' },
    radius: { label: 'Radius', min: 0.01, step: 0.05 },
    height: { label: 'Height', min: 0.01, step: 0.05 },
    offset: { label: 'Offset', kind: 'vector3' },
    sensor: { label: 'Sensor' },
    layer: { label: 'Collision Layer' },
    collidesWith: { label: 'Collision Mask', kind: 'string-list' },
    friction: { label: 'Friction', min: 0, max: 1, step: 0.05 },
    restitution: { label: 'Restitution', min: 0, max: 1, step: 0.05 },
  } satisfies Record<string, ParamSpec>

  shape: ColliderShape = 'box'
  /** A box's full extents `[x, y, z]`. */
  size: Vec3Json = [1, 1, 1]
  /** A sphere's or capsule's radius. */
  radius = 0.5
  /** A capsule's total end-to-end height. */
  height = 1.8
  /** Where the shape sits in the entity's local frame. */
  offset: Vec3Json = [0, 0, 0]
  /** A trigger: detects overlaps, never pushes or is pushed. */
  sensor = false
  /** One exact, case-sensitive `^[a-z][a-z0-9-]*$` membership name. */
  layer = 'default'
  /** Outgoing layer interest for `onCollide`; `'*'` means every valid layer and `[]` means none. */
  collidesWith: string[] = ['*']
  friction = 0.5
  restitution = 0

  override onReady(): void {
    this.game.physics.attach(this.entity)
  }

  override onDestroy(): void {
    this.game.physics.detach(this.entity)
  }
}
