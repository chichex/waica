import { Hitbox, resolveSolidAxis, type CollisionBody, type Entity } from '@waica/engine'

/** A 2D Chaser's body: the AABB of its sibling Hitbox (the chassis default if none). */
function chaserBody(entity: Entity): CollisionBody {
  const box = entity.get(Hitbox)
  return {
    x: entity.position.x + (box?.offsetX ?? 0),
    y: entity.position.y + (box?.offsetY ?? 0),
    width: box?.width ?? 0.9,
    height: box?.height ?? 0.95,
    shape: 'rectangle',
  }
}

/**
 * Resolves a 2D Chaser's move along one axis through the engine's shared
 * Solid solver; true when a Solid stopped it. Its own module so Chaser, which
 * also chases in 3D (issue #181), reads no 2D component itself.
 */
export function resolveChaserAxis(entity: Entity, axis: 'x' | 'y', previous: number): boolean {
  return resolveSolidAxis({ entity, axis, previous, body: () => chaserBody(entity) })
}
