// @vitest-environment happy-dom
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetLoader } from '../assets/asset-loader'
import { FakeTextureBackend } from '../assets/test-helpers'
import type { Entity } from '../entity'
import type { Game } from '../game'
import { AnimatedSprite } from './animated-sprite'

type Mesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
type Outcome = 'loaded' | 'failed'

interface StubHandle {
  base: THREE.Texture
  clone: THREE.Texture
  settle(outcome: Outcome): void
}

/**
 * A stub of game.assets: one clone per call (sharing a per-url base's
 * Source), each with a settlement the test resolves by hand; the image
 * is installed on the shared Source when the test settles it as loaded,
 * the way the real loader does.
 */
function assetsStub(size = { width: 64, height: 64 }) {
  const handles: StubHandle[] = []
  const bases = new Map<string, THREE.Texture>()
  const texture = vi.fn((url: string) => {
    let base = bases.get(url)
    if (!base) {
      base = new THREE.Texture()
      bases.set(url, base)
    }
    const clone = new THREE.Texture()
    clone.source = base.source
    let resolve!: (outcome: Outcome) => void
    const settled = new Promise<Outcome>((accept) => {
      resolve = accept
    })
    const handle: StubHandle = {
      base,
      clone,
      settle: (outcome) => {
        if (outcome === 'loaded') clone.image = { ...size } as HTMLImageElement
        resolve(outcome)
      },
    }
    handles.push(handle)
    return { texture: clone, settled }
  })
  return { assets: { texture }, handles }
}

function mountWith(sprite: AnimatedSprite, game: unknown): Mesh {
  const added: unknown[] = []
  sprite.entity = { node: { add: (child: unknown) => added.push(child) } } as unknown as Entity
  sprite.game = game as Game
  sprite.onReady()
  return added[0] as Mesh
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('AnimatedSprite sheets through game.assets (CA-5)', () => {
  it('requests every sheet once and re-applies the frame from the image size when a sheet settles loaded', async () => {
    const { assets, handles } = assetsStub()
    const sprite = new AnimatedSprite()
    sprite.texture = '/hero.png'
    sprite.cols = 2
    sprite.rows = 1
    sprite.spacingX = 2
    sprite.extraSheets = [{ texture: '/hero-extra.png', cols: 2, rows: 1 }]
    sprite.clips = { idle: { frames: [0], fps: 1 } }
    sprite.initialClip = 'idle'

    const mesh = mountWith(sprite, { assets })

    expect(assets.texture.mock.calls).toEqual([['/hero.png'], ['/hero-extra.png']])
    expect(mesh.material.map).toBe(handles[0]?.clone)
    // Before the image: the uniform-grid fallback keeps the whole cell width.
    expect(handles[0]?.clone.repeat.x).toBe(0.5)

    handles[0]?.settle('loaded')
    await flush()
    // With the 64 px image known, the 2 px spacing shrinks the cell to 31 px.
    expect(handles[0]?.clone.repeat.x).toBe(31 / 64)
  })

  it('re-applies on a cache hit too, whose settlement is already resolved', async () => {
    const { assets, handles } = assetsStub()
    const sprite = new AnimatedSprite()
    sprite.texture = '/hero.png'
    sprite.cols = 2
    sprite.rows = 1
    sprite.spacingX = 2
    sprite.clips = { idle: { frames: [0], fps: 1 } }
    sprite.initialClip = 'idle'
    mountWith(sprite, { assets })
    handles[0]?.settle('loaded')
    await flush()

    const second = new AnimatedSprite()
    second.texture = '/hero.png'
    second.cols = 2
    second.rows = 1
    second.spacingX = 2
    second.clips = { idle: { frames: [0], fps: 1 } }
    second.initialClip = 'idle'
    mountWith(second, { assets })
    // The shared Source already carries the image; the settlement still fires and re-applies.
    handles[1]?.settle('loaded')
    await flush()

    expect(handles[1]?.clone.repeat.x).toBe(31 / 64)
  })

  it('ignores a settlement that lands after onDestroy, and disposes only its clones', async () => {
    const { assets, handles } = assetsStub()
    const sprite = new AnimatedSprite()
    sprite.texture = '/hero.png'
    sprite.cols = 2
    sprite.rows = 1
    sprite.spacingX = 2
    sprite.clips = { idle: { frames: [0], fps: 1 } }
    sprite.initialClip = 'idle'
    mountWith(sprite, { assets })
    const handle = handles[0]!
    const cloneDispose = vi.spyOn(handle.clone, 'dispose')
    const baseDispose = vi.spyOn(handle.base, 'dispose')

    sprite.onDestroy()
    handle.settle('loaded')
    await flush()

    expect(cloneDispose).toHaveBeenCalledTimes(1)
    expect(baseDispose).not.toHaveBeenCalled()
    expect(handle.clone.repeat.x).toBe(0.5)
  })

  it('without a texture never touches game.assets and still owns an empty map', () => {
    const { assets } = assetsStub()
    const sprite = new AnimatedSprite()

    const mesh = mountWith(sprite, { assets })

    expect(assets.texture).not.toHaveBeenCalled()
    expect(mesh.material.map).toBeInstanceOf(THREE.Texture)
    expect(mesh.material.map?.image).toBeNull()
  })
})

describe('AnimatedSprite failure rule (CA-4)', () => {
  it('clears the map of a sheet that fails to load and never samples that sheet again', async () => {
    const backend = new FakeTextureBackend()
    backend.failUrl('/hero.png')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assets = new AssetLoader({ backend })
    const sprite = new AnimatedSprite()
    sprite.texture = '/hero.png'
    sprite.cols = 2
    sprite.rows = 1
    sprite.extraSheets = [{ texture: '/hero-extra.png', cols: 1, rows: 1 }]
    // Frame 0 lives on the failed main sheet, frame 2 on the healthy extra one.
    sprite.clips = { idle: { frames: [0, 2], fps: 1 } }
    sprite.initialClip = 'idle'

    const mesh = mountWith(sprite, { assets })
    const failed = mesh.material.map
    expect(failed).toBeInstanceOf(THREE.Texture)

    await assets.ready()

    expect(mesh.material.map).toBeNull()
    expect(mesh.material.color.getHex()).toBe(0xffffff)
    sprite.onUpdate(1)
    const extra = mesh.material.map
    expect(extra).toBeInstanceOf(THREE.Texture)
    expect(extra).not.toBe(failed)
    // Back on the failed sheet: its clone is never installed again.
    sprite.onUpdate(1)
    expect(mesh.material.map).toBeNull()
  })
})
