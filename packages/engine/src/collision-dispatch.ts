import { collisionBody } from './collision-body.js'
import { collisionMaskTargets } from './collision-category.js'
import { collisionOverlap } from './collision-shape.js'
import { Hitbox } from './components/hitbox.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'

interface HitboxSnapshot {
  readonly entity: Entity
  readonly hitbox: Hitbox
  readonly entityIndex: number
}

interface CollisionPair {
  readonly first: HitboxSnapshot
  readonly second: HitboxSnapshot
}

/** Package-internal deterministic work receipt used by focused tests. */
export interface CollisionDispatchStats {
  readonly candidatePairs: number
  readonly narrowphaseCalls: number
}

function collisionPairs(game: Game): CollisionPair[] {
  const hitboxes: HitboxSnapshot[] = []
  for (const [entityIndex, entity] of [...game.entities].entries()) {
    if (!entity.alive) continue
    const hitbox = entity.get(Hitbox)
    if (hitbox) hitboxes.push({ entity, hitbox, entityIndex })
  }
  const result: CollisionPair[] = []
  for (let first = 0; first < hitboxes.length; first += 1) {
    for (let second = first + 1; second < hitboxes.length; second += 1) {
      result.push({ first: hitboxes[first]!, second: hitboxes[second]! })
    }
  }
  return result
}

/** Game's package-internal trigger dispatch implementation. */
export function dispatchCollisions(game: Game): CollisionDispatchStats {
  const pairs = collisionPairs(game)
  let narrowphaseCalls = 0
  for (const { first, second } of pairs) {
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
