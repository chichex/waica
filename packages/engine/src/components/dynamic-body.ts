import {
  COLLISION_SHAPES,
  collisionBounds,
  collisionOverlap,
  resolveCollisionPoints,
  type CollisionBody,
  type CollisionPoint,
  type CollisionShape,
} from '../collision-shape'
import { Component, type ContactNormal, type SolidContact } from '../component'
import { resolveSolidAxis, type CollisionAxis } from '../solid-axis'
import { Solid } from './solid'

interface RecoveryDirection {
  axis: CollisionAxis
  sign: -1 | 1
  normal: ContactNormal
}

interface Recovery {
  contacts: SolidContact[]
  direction: RecoveryDirection
  shift: number
}

/** Stable tie order for equal-distance initial-overlap recovery. */
const RECOVERY_DIRECTIONS: readonly RecoveryDirection[] = [
  { axis: 'x', sign: -1, normal: { x: -1, y: 0 } },
  { axis: 'x', sign: 1, normal: { x: 1, y: 0 } },
  { axis: 'y', sign: -1, normal: { x: 0, y: -1 } },
  { axis: 'y', sign: 1, normal: { x: 0, y: 1 } },
]

const RECOVERY_ITERATIONS = 24

/**
 * Reusable linear body: integrates its public velocity and resolves only
 * against static Solid geometry. Hitbox trigger overlaps remain independent.
 */
export class DynamicBody extends Component {
  static override componentName = 'DynamicBody'
  static override params = {
    vx: { label: 'x velocity', step: 0.1 },
    vy: { label: 'y velocity', step: 0.1 },
    shape: { label: 'shape', options: [...COLLISION_SHAPES] },
    width: { label: 'width', min: 0, step: 0.1 },
    height: { label: 'height', min: 0, step: 0.1 },
    offsetX: { label: 'x offset', step: 0.1 },
    offsetY: { label: 'y offset', step: 0.1 },
    points: { label: 'polygon points' },
  }

  vx = 0
  vy = 0
  shape: CollisionShape = 'rectangle'
  width = 1
  height = 1
  offsetX = 0
  offsetY = 0
  /** Polygon vertices normalized against width/height. */
  points: CollisionPoint[] = resolveCollisionPoints(undefined)

  override onUpdate(dt: number): void {
    const delivered = new Map<Solid, Set<string>>()
    const recovery = this.recoverInitialOverlap()
    if (recovery && !this.deliver(recovery.contacts, delivered)) return
    if (!this.moveAxis('x', this.vx * dt, delivered)) return
    this.moveAxis('y', this.vy * dt, delivered)
  }

  private moveAxis(
    axis: CollisionAxis,
    displacement: number,
    delivered: Map<Solid, Set<string>>,
  ): boolean {
    if (displacement === 0) return this.entity.alive
    const previous = this.entity.position[axis]
    this.entity.position[axis] += displacement
    const solids: Solid[] = []
    const blocked = resolveSolidAxis({
      entity: this.entity,
      axis,
      previous,
      body: () => this.collisionBody(),
      onContact: (solid) => solids.push(solid),
    })
    if (!blocked) return this.entity.alive

    if (axis === 'x') this.vx = 0
    else this.vy = 0
    const normal: ContactNormal =
      axis === 'x'
        ? { x: displacement > 0 ? -1 : 1, y: 0 }
        : { x: 0, y: displacement > 0 ? -1 : 1 }
    return this.deliver(
      solids.map((solid) => this.contact(solid, axis, normal)),
      delivered,
    )
  }

  /**
   * Finds the shortest cardinal translation that clears every Solid.
   * Equal distances keep RECOVERY_DIRECTIONS order: -X, +X, -Y, +Y.
   */
  private recoverInitialOverlap(): Recovery | null {
    const solids = this.solids()
    const overlapping = solids.filter((solid) =>
      collisionOverlap(this.collisionBody(), this.solidBody(solid)),
    )
    if (overlapping.length === 0) return null

    const original = { x: this.entity.position.x, y: this.entity.position.y }
    const bodyBounds = collisionBounds(this.collisionBody())
    let best: Recovery | null = null

    for (const direction of RECOVERY_DIRECTIONS) {
      const shifts = solids
        .map((solid) => {
          const bounds = collisionBounds(this.solidBody(solid))
          if (direction.axis === 'x') {
            return direction.sign < 0
              ? bounds.left - bodyBounds.right
              : bounds.right - bodyBounds.left
          }
          return direction.sign < 0
            ? bounds.bottom - bodyBounds.top
            : bounds.top - bodyBounds.bottom
        })
        .filter((shift) => shift * direction.sign > 0)
        .sort((a, b) => Math.abs(a) - Math.abs(b))

      let clear: number | null = null
      for (const shift of shifts) {
        this.setShift(original, direction.axis, shift)
        if (!this.overlapsAny(solids)) {
          clear = shift
          break
        }
      }
      this.resetPosition(original)
      if (clear === null) continue

      let blockedShift = 0
      let clearShift = clear
      for (let iteration = 0; iteration < RECOVERY_ITERATIONS; iteration++) {
        const middle = (blockedShift + clearShift) / 2
        this.setShift(original, direction.axis, middle)
        if (this.overlapsAny(solids)) blockedShift = middle
        else clearShift = middle
      }
      this.resetPosition(original)

      if (best && Math.abs(clearShift) >= Math.abs(best.shift)) continue
      best = {
        direction,
        shift: clearShift,
        contacts: overlapping.map((solid) =>
          this.contact(solid, direction.axis, direction.normal),
        ),
      }
    }

    if (!best) return null
    this.setShift(original, best.direction.axis, best.shift)
    return best
  }

  private setShift(
    original: Readonly<{ x: number; y: number }>,
    axis: CollisionAxis,
    shift: number,
  ): void {
    this.entity.position[axis] = original[axis] + shift
  }

  private resetPosition(original: Readonly<{ x: number; y: number }>): void {
    this.entity.position.x = original.x
    this.entity.position.y = original.y
  }

  private overlapsAny(solids: Solid[]): boolean {
    const body = this.collisionBody()
    return solids.some((solid) => collisionOverlap(body, this.solidBody(solid)))
  }

  private deliver(
    contacts: SolidContact[],
    delivered: Map<Solid, Set<string>>,
  ): boolean {
    for (const contact of contacts) {
      const direction = `${contact.axis}:${contact.normal.x}:${contact.normal.y}`
      const directions = delivered.get(contact.solid) ?? new Set<string>()
      if (directions.has(direction)) continue
      directions.add(direction)
      delivered.set(contact.solid, directions)
      for (const component of [...this.entity.components]) {
        if (!this.entity.alive) return false
        component.onContact?.(contact)
      }
    }
    return this.entity.alive
  }

  private contact(
    solid: Solid,
    axis: CollisionAxis,
    normal: ContactNormal,
  ): SolidContact {
    return { entity: solid.entity, solid, axis, normal }
  }

  private solids(): Solid[] {
    return this.game.entities
      .filter((entity) => entity !== this.entity)
      .map((entity) => entity.get(Solid))
      .filter((solid): solid is Solid => solid !== undefined)
  }

  private collisionBody(): CollisionBody {
    return {
      x: this.entity.position.x + this.offsetX,
      y: this.entity.position.y + this.offsetY,
      width: this.width,
      height: this.height,
      shape: this.shape,
      points: this.points,
    }
  }

  private solidBody(solid: Solid): CollisionBody {
    return {
      x: solid.entity.position.x + solid.offsetX,
      y: solid.entity.position.y + solid.offsetY,
      width: solid.width,
      height: solid.height,
      shape: solid.shape,
      points: solid.points,
    }
  }
}
