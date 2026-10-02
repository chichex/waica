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

/**
 * Game's package-internal trigger dispatch implementation. Pairs come from a
 * frozen grid; each pair is then checked live, most selective checks first
 * (liveness, masks, then the snapshotted Hitbox still mounted). The checks
 * have no side effects, so their order only changes how fast a pair is
 * rejected.
 */
export function dispatchCollisions(game: Game): CollisionDispatchStats {
  let candidatePairs = 0
  let narrowphaseCalls = 0
  createHitboxBroadphase(game).forEachPair((first, second) => {
    candidatePairs += 1
    const a = first.entity
    const b = second.entity
    if (!a.alive || !b.alive) return

    const notifyA = collisionMaskTargets(first.hitbox.collidesWith, second.hitbox.layer)
    const notifyB = collisionMaskTargets(second.hitbox.collidesWith, first.hitbox.layer)
    if (!notifyA && !notifyB) return
    if (a.get(Hitbox) !== first.hitbox || b.get(Hitbox) !== second.hitbox) return

    narrowphaseCalls += 1
    if (!collisionOverlap(collisionBody(first.hitbox), collisionBody(second.hitbox))) return

    if (notifyA) {
      for (const component of [...a.components]) component.onCollide?.(b)
    }
    if (!a.alive || !b.alive) return
    if (notifyB) {
      for (const component of [...b.components]) component.onCollide?.(a)
    }
  })
  return { candidatePairs, narrowphaseCalls }
}
