import { collisionBody } from './collision-body.js'
import { collisionMaskTargets } from './collision-category.js'
import { collisionOverlap } from './collision-shape.js'
import { Hitbox } from './components/hitbox.js'
import type { Game } from './game.js'
import { createHitboxBroadphase } from './spatial-broadphase.js'

/** Package-internal deterministic work receipt used by focused tests. */
export interface CollisionDispatchStats {
  readonly candidatePairs: number
  readonly narrowphaseCalls: number
}

/** Game's package-internal trigger dispatch implementation. */
export function dispatchCollisions(game: Game): CollisionDispatchStats {
  const pairs = createHitboxBroadphase(game).pairs()
  let narrowphaseCalls = 0
  for (const [first, second] of pairs) {
    const a = first.entity
    const b = second.entity
    if (!a.alive || !b.alive) continue
    if (a.get(Hitbox) !== first.hitbox || b.get(Hitbox) !== second.hitbox) continue

    const notifyA = collisionMaskTargets(first.hitbox.collidesWith, second.hitbox.layer)
    const notifyB = collisionMaskTargets(second.hitbox.collidesWith, first.hitbox.layer)
    if (!notifyA && !notifyB) continue

    narrowphaseCalls += 1
    if (!collisionOverlap(collisionBody(first.hitbox), collisionBody(second.hitbox))) continue

    if (notifyA) {
      for (const component of [...a.components]) component.onCollide?.(b)
    }
    if (!a.alive || !b.alive) continue
    if (notifyB) {
      for (const component of [...b.components]) component.onCollide?.(a)
    }
  }
  return { candidatePairs: pairs.length, narrowphaseCalls }
}
