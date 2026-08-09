// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { AnimatedSprite } from './animated-sprite'

describe('AnimatedSprite quad sync', () => {
  it('negates offsetX when flipped, mirroring the quad around its anchor', () => {
    const sprite = new AnimatedSprite()
    const added: unknown[] = []
    sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
    sprite.game = {} as unknown as Game
    sprite.offsetX = 3

    sprite.onReady()
    const mesh = added[0] as { position: { x: number } }
    expect(mesh.position.x).toBe(3)

    sprite.setFlipX(true)
    expect(mesh.position.x).toBe(-3)

    sprite.setFlipX(false)
    expect(mesh.position.x).toBe(3)
  })
})
