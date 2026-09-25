// @vitest-environment happy-dom
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { Sprite } from './sprite'

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

/** A stub of game.assets: hands out `clone` (sharing `base`'s Source) for every url and records the calls. */
function assetsStub(): { assets: { texture: ReturnType<typeof vi.fn> }; base: THREE.Texture; clone: THREE.Texture } {
  const base = new THREE.Texture()
  const clone = new THREE.Texture()
  clone.source = base.source
  const texture = vi.fn(() => ({ texture: clone, settled: Promise.resolve('loaded' as const) }))
  return { assets: { texture }, base, clone }
}

function mount(sprite: Sprite, game: unknown): Mesh {
  const added: unknown[] = []
  sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
  sprite.game = game as Game
  sprite.onReady()
  return added[0] as Mesh
}

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

describe('Sprite textures through game.assets (CA-5)', () => {
  it('requests its texture once, maps its own clone with nearest filters under pixelArt and a white colour', () => {
    const { assets, clone } = assetsStub()
    const sprite = new Sprite()
    sprite.texture = '/hero.png'
    sprite.pixelArt = true
    sprite.color = 0x123456

    const mesh = mount(sprite, { assets })

    expect(assets.texture).toHaveBeenCalledTimes(1)
    expect(assets.texture).toHaveBeenCalledWith('/hero.png')
    expect(mesh.material.map).toBe(clone)
    expect(clone.magFilter).toBe(THREE.NearestFilter)
    expect(clone.minFilter).toBe(THREE.NearestFilter)
    expect(mesh.material.color.getHex()).toBe(0xffffff)
  })

  it('leaves the filters linear without pixelArt', () => {
    const { assets, clone } = assetsStub()
    const sprite = new Sprite()
    sprite.texture = '/hero.png'

    mount(sprite, { assets })

    expect(clone.magFilter).toBe(THREE.LinearFilter)
    expect(clone.minFilter).toBe(THREE.LinearMipmapLinearFilter)
  })

  it('never touches game.assets without a texture and keeps its flat colour', () => {
    const { assets } = assetsStub()
    const sprite = new Sprite()
    sprite.color = 0x123456

    const mesh = mount(sprite, { assets })

    expect(assets.texture).not.toHaveBeenCalled()
    expect(mesh.material.map).toBeNull()
    expect(mesh.material.color.getHex()).toBe(0x123456)
  })

  it('onDestroy disposes only its own clone, never the cached base', () => {
    const { assets, base, clone } = assetsStub()
    const baseDispose = vi.spyOn(base, 'dispose')
    const cloneDispose = vi.spyOn(clone, 'dispose')
    const sprite = new Sprite()
    sprite.texture = '/hero.png'
    mount(sprite, { assets })

    sprite.onDestroy()

    expect(cloneDispose).toHaveBeenCalledTimes(1)
    expect(baseDispose).not.toHaveBeenCalled()
  })
})
