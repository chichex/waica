import { Hitbox, type CollisionBody, type CollisionPoint, type Entity } from '@waica/engine'

/**
 * Where a 2D melee blow lands (MeleeAttack in a 2D scene): the oriented
 * `range` × `width` rectangle in front of the attacker along the logical
 * `direction`, as a unit-scaled polygon. Anchored on the attacker's own
 * Hitbox — the same offset every target is read through — so an offset body
 * swings from where it stands, not from its transform. An attacker without
 * one keeps swinging from its position. Its own module so MeleeAttack, which
 * strikes in both spaces, reads no 2D component itself (issue #181).
 */
export function meleeArea2d(
  attacker: Entity,
  direction: { x: number; y: number },
  extent: { range: number; width: number },
): CollisionBody {
  const box = attacker.get(Hitbox)
  const { x: dx, y: dy } = direction
  const along = { x: (dx * extent.range) / 2, y: (dy * extent.range) / 2 }
  const across = { x: (-dy * extent.width) / 2, y: (dx * extent.width) / 2 }
  const points: CollisionPoint[] = [
    [-along.x - across.x, -along.y - across.y],
    [along.x - across.x, along.y - across.y],
    [along.x + across.x, along.y + across.y],
    [-along.x + across.x, -along.y + across.y],
  ]
  return {
    x: attacker.position.x + (box?.offsetX ?? 0) + along.x,
    y: attacker.position.y + (box?.offsetY ?? 0) + along.y,
    width: 1,
    height: 1,
    shape: 'polygon',
    points,
  }
}
