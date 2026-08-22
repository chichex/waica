import { collisionBounds, collisionOverlap, type CollisionBody } from './collision-shape.js'
import { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import { sceneSolids } from './scene-solids.js'

export type CollisionAxis = 'x' | 'y'

export interface SolidAxisOptions {
  /** Dynamic entity whose axis position has already been moved to its target. */
  entity: Entity
  axis: CollisionAxis
  /** Known pre-move position on this axis. */
  previous: number
  /** Current world-space collision body; read again as the axis position changes. */
  body(): CollisionBody
  /** Receives each nearest Solid that blocks this axis move. */
  onContact?(solid: Solid): void
}

const CONTACT_TOLERANCE = 1e-7

function bodyFor(solid: Solid): CollisionBody {
  return {
    x: solid.entity.position.x + solid.offsetX,
    y: solid.entity.position.y + solid.offsetY,
    width: solid.width,
    height: solid.height,
    shape: solid.shape,
    points: solid.points,
  }
}

/**
 * Resolves one axis against scene Solids. Large displacements are split into
 * body-sized steps so a thin wall cannot sit entirely between two samples.
 * Returns whether a new contact blocked the move.
 */
export function resolveSolidAxis({
  entity,
  axis,
  previous,
  body,
  onContact,
}: SolidAxisOptions): boolean {
  const position = entity.position
  const target = position[axis]
  const solids = sceneSolids(entity.game, entity)

  position[axis] = previous
  // Preserve the established spawn-inside-wall bail: pre-existing overlaps
  // are ignored for this move rather than becoming arbitrary push-out rules.
  const ignored = new Set(
    solids.filter((solid) => collisionOverlap(body(), bodyFor(solid))),
  )

  const bounds = collisionBounds(body())
  const extent = axis === 'x' ? bounds.right - bounds.left : bounds.top - bounds.bottom
  const maxStep = Math.max(extent / 2, 0.05)
  const displacement = target - previous
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / maxStep))
  let free = previous

  for (let step = 1; step <= steps; step++) {
    const candidate = previous + displacement * (step / steps)
    position[axis] = candidate
    const blockers = solids.filter(
      (solid) => !ignored.has(solid) && collisionOverlap(body(), bodyFor(solid)),
    )
    if (blockers.length === 0) {
      free = candidate
      continue
    }

    // More than one Solid can occupy a sample. Resolve against each from the
    // same known-free point and keep the nearest contact along this move.
    let contact = candidate
    let contactDistance = Infinity
    let contacts: Solid[] = []
    for (const solid of blockers) {
      let open = free
      let blocked = candidate
      for (let iteration = 0; iteration < 14; iteration++) {
        const middle = (open + blocked) / 2
        position[axis] = middle
        if (collisionOverlap(body(), bodyFor(solid))) blocked = middle
        else open = middle
      }
      const distance = Math.abs(open - free)
      if (distance < contactDistance - CONTACT_TOLERANCE) {
        contact = open
        contactDistance = distance
        contacts = [solid]
      } else if (Math.abs(distance - contactDistance) <= CONTACT_TOLERANCE) {
        contacts.push(solid)
      }
    }
    position[axis] = contact
    for (const solid of contacts) onContact?.(solid)
    return true
  }

  position[axis] = target
  return false
}
