// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { AnimatedSprite } from './animated-sprite'

describe('AnimatedSprite quad sync', () => {
  const mount = (sprite: AnimatedSprite) => {
    const added: unknown[] = []
    sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
    sprite.game = {} as unknown as Game
    sprite.onReady()
    return added[0] as {
      position: { x: number; y: number; toArray(): number[] }
      scale: { toArray(): number[] }
    }
  }

  it('pins the default-anchor quad at its offsets with its declared size', () => {
    const sprite = new AnimatedSprite()
    sprite.width = 2
    sprite.height = 4
    sprite.offsetX = 3
    sprite.offsetY = -2

    const mesh = mount(sprite)

    expect(mesh.position.toArray()).toEqual([3, -2, 0])
    expect(mesh.scale.toArray()).toEqual([2, 4, 1])
  })

  it('pins a smaller packed frame to the full-size box floor', () => {
    const sprite = new AnimatedSprite()
    sprite.width = 4
    sprite.height = 2
    sprite.offsetY = 1
    sprite.cells = [
      { x: 0, y: 0, width: 4, height: 4 },
      { x: 4, y: 0, width: 2, height: 2 },
    ]
    const mesh = mount(sprite)

    ;(sprite as unknown as { showFrame(index: number): void }).showFrame(1)

    expect(mesh.position.toArray()).toEqual([0, 0.5, 0])
    expect(mesh.scale.toArray()).toEqual([2, 1, 1])
  })

  it('places the full-size box from a declared quarter-height anchor', () => {
    const sprite = new AnimatedSprite()
    sprite.height = 2
    const mesh = mount(sprite)

    sprite.anchorY = 0.25

    expect(mesh.position.y).toBe(0.5)
  })

  it('negates offsetX when flipped, mirroring the quad around its anchor', () => {
    const sprite = new AnimatedSprite()
    sprite.offsetX = 3

    const mesh = mount(sprite)
    expect(mesh.position.x).toBe(3)

    sprite.setFlipX(true)
    expect(mesh.position.x).toBe(-3)

    sprite.setFlipX(false)
    expect(mesh.position.x).toBe(3)
  })
})
