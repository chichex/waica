// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGLRenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.module.js', import.meta.url)
    .pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
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
  },
)

import { Game, installArchetype, installDirectionalAnimation, resetRegistries } from '@waica/engine'
import { ARCHETYPE, ISOMETRIC_CAVE_SCENE, ISOMETRIC_SCENE } from '@waica/archetype-isometric'
// Not exported from the engine's entry, like audio's fake (ADR 0013): the
// example reaches it the same way it reaches the engine's copy of three.
import { FakeTextureBackend } from '../../../packages/engine/src/assets/test-helpers'
import controls from './controls.json'
import stats from './stats.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** The shipped demo, booted exactly as main.ts boots it, with the texture backend injected. */
function makeDemo(): { game: Game; backend: FakeTextureBackend } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation ?? null)
  const backend = new FakeTextureBackend()
  const game = new Game({ canvas, bindings: controls.bindings, stats: stats.stats, textures: backend })
  game.registerSceneCatalog({
    scenes: { main: ISOMETRIC_SCENE, cave: ISOMETRIC_CAVE_SCENE },
    registry: ARCHETYPE.registry,
  })
  return { game, backend }
}

const file = (url: string): string => url.slice(url.lastIndexOf('/') + 1)

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('the isometric demo through game.assets (CA-2, CA-6)', () => {
  it('loads "main" with exactly seven backend loads, one per distinct URL, not one per textured instance', async () => {
    const { game, backend } = makeDemo()

    game.loadSceneByName('main')
    await game.assets.ready()

    // Three crates, three trees, two rocks, a door on the rock art, the
    // ground, the hero, the villager and the orc: seven images.
    expect(backend.loadCalls.map(file).sort()).toEqual([
      'waica-iso-crate.png',
      'waica-iso-ground.png',
      'waica-iso-hero.png',
      'waica-iso-orc.png',
      'waica-iso-rock.png',
      'waica-iso-tree.png',
      'waica-iso-villager.png',
    ])
    expect(game.assets.status).toEqual({ pending: 0, loaded: 7, failed: 0 })
    game.dispose()
  })

  it('keeps every texture across main → cave → main: the return trip loads nothing', async () => {
    const { game, backend } = makeDemo()
    game.loadSceneByName('main')
    await game.assets.ready()
    expect(backend.loadCalls).toHaveLength(7)

    game.loadSceneByName('cave')
    await game.assets.ready()
    // cave's art (ground, hero, rock) is a subset of main's: nothing new.
    expect(backend.loadCalls).toHaveLength(7)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 7, failed: 0 })

    game.loadSceneByName('main')
    await game.assets.ready()
    expect(backend.loadCalls).toHaveLength(7)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 7, failed: 0 })

    game.dispose()
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
  })
})
