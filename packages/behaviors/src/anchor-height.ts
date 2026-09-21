import { AnimatedSprite, Sprite, type Entity } from '@waica/engine'

/** World units left between the top of the sprite box and an Anchored Piece. */
const ANCHOR_MARGIN = 0.2

/** Where an Anchored Piece sits on an entity that draws no sprite. */
const SPRITELESS_ANCHOR_HEIGHT = 1

/**
 * How far above its entity a behavior's Anchored Piece is attached
 * (issue #72, CA-14): the top edge of the entity's first Sprite or
 * AnimatedSprite box — the box the pointer picks against, so
 * `offsetY + height × (1 − anchorY)` — plus a small margin, or one world
 * unit when it has neither. Read at attach time; no behavior carries a
 * height param of its own.
 */
export function anchorHeight(entity: Entity): number {
  for (const component of entity.components) {
    if (component instanceof Sprite || component instanceof AnimatedSprite) {
      return component.offsetY + component.height * (1 - component.anchorY) + ANCHOR_MARGIN
    }
  }
  return SPRITELESS_ANCHOR_HEIGHT
}
