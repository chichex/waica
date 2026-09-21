import { describe, expect, it } from 'vitest'
import { AnimatedSprite, Component, Sprite, type Entity } from '@waica/engine'
import { anchorHeight } from './anchor-height'

class Marker extends Component {
  static override componentName = 'Marker'
}

function sprite(props: Partial<Pick<Sprite, 'height' | 'offsetY' | 'anchorY'>>): Sprite {
  return Object.assign(new Sprite(), props)
}

function animatedSprite(
  props: Partial<Pick<AnimatedSprite, 'height' | 'offsetY' | 'anchorY'>>,
): AnimatedSprite {
  return Object.assign(new AnimatedSprite(), props)
}

function entityWith(...components: Component[]): Entity {
  return { components } as unknown as Entity
}

/**
 * CA-14 (issue #72): Anchored Pieces sit above the top edge of the box the
 * pointer picks against — offsetY + height × (1 − anchorY) — plus a 0.2
 * world-unit margin; 1 world unit when the entity draws no sprite.
 */
describe('anchorHeight', () => {
  it('puts the anchor 0.2 above the top of a Sprite box (the isometric orc: 2 tall, anchored at its feet, 9/16 down)', () => {
    const orc = entityWith(sprite({ height: 2, anchorY: 0, offsetY: -9 / 16 }))

    expect(anchorHeight(orc)).toBeCloseTo(1.6375, 10)
  })

  it('reads an AnimatedSprite box the same way', () => {
    const slime = entityWith(animatedSprite({ height: 1.5, anchorY: 0.5, offsetY: 0.25 }))

    expect(anchorHeight(slime)).toBeCloseTo(1.2, 10)
  })

  it('uses the first Sprite or AnimatedSprite in component order', () => {
    const tallSprite = sprite({ height: 3, anchorY: 0 })
    const shortAnimation = animatedSprite({ height: 1, anchorY: 0.5 })

    expect(anchorHeight(entityWith(new Marker(), shortAnimation, tallSprite))).toBeCloseTo(0.7, 10)
    expect(anchorHeight(entityWith(new Marker(), tallSprite, shortAnimation))).toBeCloseTo(3.2, 10)
  })

  it('falls back to one world unit without a sprite', () => {
    expect(anchorHeight(entityWith(new Marker()))).toBe(1)
    expect(anchorHeight(entityWith())).toBe(1)
  })
})
