// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { Sprite } from './sprite'

describe('Sprite placement characterization', () => {
  it('pins the default-anchor quad at its offsets with its declared size', () => {
    const sprite = new Sprite()
    const added: unknown[] = []
    sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
    sprite.game = {} as Game
    sprite.width = 2
    sprite.height = 4
    sprite.offsetX = 3
    sprite.offsetY = -2

    sprite.onReady()

    const mesh = added[0] as {
      position: { toArray(): number[] }
      scale: { toArray(): number[] }
    }
    expect(mesh.position.toArray()).toEqual([3, -2, 0])
    expect(mesh.scale.toArray()).toEqual([2, 4, 1])
  })

  it('places the quad from a declared bottom anchor reactively', () => {
    const sprite = new Sprite()
    const added: unknown[] = []
    sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
    sprite.game = {} as Game
    sprite.width = 2
    sprite.height = 2
    sprite.onReady()

    sprite.anchorY = 0

    const mesh = added[0] as {
      position: { toArray(): number[] }
      scale: { toArray(): number[] }
    }
    expect(mesh.position.toArray()).toEqual([0, 1, 0])
    expect(mesh.scale.toArray()).toEqual([2, 2, 1])
  })
})
