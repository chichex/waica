// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    render(): void {}
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import * as THREE from 'three'
import * as engine from '../index.js'
import { Game, type SceneJson, type SceneRegistry } from '../index.js'
import { Sprite } from '../components/sprite.js'
import { FakeTextureBackend } from './test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(textures?: FakeTextureBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game(textures ? { canvas, textures } : { canvas })
}

const ART: Record<string, string> = {
  'waica:crate': '/art/crate.png',
  'waica:tree': '/art/tree.png',
  'waica:hero': '/art/hero.png',
  'waica:rock': '/art/rock.png',
}

function sprite(name: string, texture: string): SceneJson['entities'][number] {
  return { name, components: [{ type: 'Sprite', props: { texture } }] }
}

/** main: three crates, a tree and the hero; cave: the hero and a rock (a subset plus one). */
const MAIN: SceneJson = {
  waicaScene: 3,
  entities: [
    sprite('Crate-1', 'waica:crate'),
    sprite('Crate-2', 'waica:crate'),
    sprite('Crate-3', 'waica:crate'),
    sprite('Tree', 'waica:tree'),
    sprite('Player', 'waica:hero'),
  ],
}
const CAVE: SceneJson = {
  waicaScene: 3,
  entities: [sprite('Player', 'waica:hero'), sprite('Rock', 'waica:rock')],
}
const REGISTRY: SceneRegistry = {
  components: { Sprite },
  resolveAsset: (uri) => ART[uri] ?? uri,
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('game.assets (CA-1)', () => {
  it('exists from construction, before any scene, and the entry exports AssetLoader', () => {
    const game = makeGame()

    expect(game.assets).toBeInstanceOf(engine.AssetLoader)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
    game.dispose()
  })

  it('routes every load of a Game through GameOptions.textures, independently per Game', async () => {
    const first = new FakeTextureBackend()
    const second = new FakeTextureBackend()
    const one = makeGame(first)
    const two = makeGame(second)

    one.assets.texture('/art/crate.png')
    await one.assets.ready()

    expect(first.loadCalls).toEqual(['/art/crate.png'])
    expect(second.loadCalls).toEqual([])
    expect(one.assets.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    expect(two.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })

    two.assets.texture('/art/crate.png')
    await two.assets.ready()
    expect(second.loadCalls).toEqual(['/art/crate.png'])
    expect(first.loadCalls).toEqual(['/art/crate.png'])
    one.dispose()
    two.dispose()
  })
})

describe('game.assets.preload through the scene catalog (CA-7)', () => {
  it('is identity before registerSceneCatalog and resolves through the catalog afterwards', async () => {
    const backend = new FakeTextureBackend()
    const game = makeGame(backend)

    await game.assets.preload(['waica:crate'])
    expect(backend.loadCalls).toEqual(['waica:crate'])

    game.registerSceneCatalog({ scenes: { main: MAIN, cave: CAVE }, registry: REGISTRY })
    await game.assets.preload(['waica:tree', '/already/resolved.png'])
    expect(backend.loadCalls).toEqual(['waica:crate', '/art/tree.png', '/already/resolved.png'])
    game.dispose()
  })
})

describe('keep-all across scenes, disposed with the Game (CA-6)', () => {
  it('never re-requests art on main → cave → main and loads one URL per textured prefab', async () => {
    const backend = new FakeTextureBackend()
    const game = makeGame(backend)
    game.registerSceneCatalog({ scenes: { main: MAIN, cave: CAVE }, registry: REGISTRY })

    game.loadSceneByName('main')
    await game.assets.ready()
    // Five textured entities, three distinct URLs: one load per URL, not per instance.
    expect(backend.loadCalls).toEqual(['/art/crate.png', '/art/tree.png', '/art/hero.png'])
    expect(game.assets.status).toEqual({ pending: 0, loaded: 3, failed: 0 })

    game.loadSceneByName('cave')
    await game.assets.ready()
    // The hero is a cache hit; only the rock is new.
    expect(backend.loadCalls).toEqual(['/art/crate.png', '/art/tree.png', '/art/hero.png', '/art/rock.png'])
    expect(game.assets.status).toEqual({ pending: 0, loaded: 4, failed: 0 })

    game.loadSceneByName('main')
    await game.assets.ready()
    // The return trip issues no backend call: crate and tree, used only by main, stayed loaded.
    expect(backend.loadCalls).toHaveLength(4)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 4, failed: 0 })

    game.unloadScene()
    expect(game.assets.status).toEqual({ pending: 0, loaded: 4, failed: 0 })
    game.dispose()
  })

  it('dispose() disposes every base exactly once, the clones through the entity cascade, and zeroes the status', async () => {
    const backend = new FakeTextureBackend()
    const game = makeGame(backend)
    // One clone per Sprite is the per-sprite path's contract: issue #77 keeps
    // it behind `render.batch: false`; the batched default is pinned below.
    const unbatched: SceneJson = { ...MAIN, render: { batch: false } }
    game.registerSceneCatalog({ scenes: { main: unbatched, cave: CAVE }, registry: REGISTRY })
    game.loadSceneByName('main')
    await game.assets.ready()
    const clones = game.entities.map(
      (entity) => (entity.node.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map,
    )
    expect(clones).toHaveLength(5)
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose')

    game.dispose()

    const disposed = dispose.mock.instances as THREE.Texture[]
    // Five clones (one per Sprite) plus three bases (one per URL).
    expect(disposed).toHaveLength(8)
    for (const clone of clones) expect(disposed.filter((texture) => texture === clone)).toHaveLength(1)
    const bases = disposed.filter((texture) => !clones.includes(texture))
    expect(bases).toHaveLength(3)
    expect(new Set(bases.map((texture) => texture.source)).size).toBe(3)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
  })
})

it('dispose() under Sprite Batches disposes one clone per key with its batch and every base exactly once (issue #77 CA-1, CA-4)', async () => {
  const backend = new FakeTextureBackend()
  const game = makeGame(backend)
  game.registerSceneCatalog({ scenes: { main: MAIN, cave: CAVE }, registry: REGISTRY })
  game.loadSceneByName('main')
  await game.assets.ready()
  const mapped = game.entities.map(
    (entity) => (entity.node.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map,
  )
  // Five sprites over three keys (crate, tree, hero): one shared clone each.
  const clones = [...new Set(mapped)]
  expect(mapped).toHaveLength(5)
  expect(clones).toHaveLength(3)
  const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose')

  game.dispose()

  const disposed = dispose.mock.instances as THREE.Texture[]
  // Three clones (one per key) plus three bases (one per URL).
  expect(disposed).toHaveLength(6)
  for (const clone of clones) expect(disposed.filter((texture) => texture === clone)).toHaveLength(1)
  const bases = disposed.filter((texture) => !clones.includes(texture))
  expect(bases).toHaveLength(3)
  expect(new Set(bases.map((texture) => texture.source)).size).toBe(3)
  expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
})
