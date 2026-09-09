// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Constructing a real Game always builds a three.js renderer; happy-dom has
// no WebGL context, so the mock targets the engine's own copy of three —
// same technique as ../../editor/viewport-scene-swap.test.tsx and
// examples/isometric/src/demo-audio.test.ts.
vi.mock(
  new URL(
    '../../../../packages/engine/node_modules/three/build/three.module.js',
    import.meta.url,
  ).pathname,
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

import {
  Game,
  installArchetype,
  installDirectionalAnimation,
  resetRegistries,
  type BrowserArchetypeManifest,
} from '@waica/engine'
import { ARCHETYPE as PLATFORMER_ARCHETYPE_RAW } from '@waica/archetype-platformer'
import { ARCHETYPE as ISOMETRIC_ARCHETYPE_RAW } from '@waica/archetype-isometric'

// Widened to the shared interface: each package's own ARCHETYPE keeps its
// narrower literal type (no "music" key at all when it sets none), but this
// test cares about the public BrowserArchetypeManifest contract, where
// "music" is always a valid — if possibly absent — optional field.
const PLATFORMER_ARCHETYPE: BrowserArchetypeManifest = PLATFORMER_ARCHETYPE_RAW
const ISOMETRIC_ARCHETYPE: BrowserArchetypeManifest = ISOMETRIC_ARCHETYPE_RAW
// Not part of @waica/engine's public entry point (ADR 0013 keeps it a test
// seam, not a shipped API) — reached the same relative way
// examples/isometric/src/demo-audio.test.ts reaches it.
import { FakeAudioBackend, flush } from '../../../engine/src/audio/test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** Fires an untracked, unbound key so it unlocks audio (CA-6). */
function unlock(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
}

/**
 * Boots a host exactly the way packages/editor/template/src/main.ts boots
 * one — the SAME raw file every generated project ships with (bundled
 * verbatim into the MCP too, see bundle-template.mjs), shared by all three
 * archetypes. No project code and an empty scene: this isolates the
 * template's own G8 mechanism ("if the archetype names a music uri, ask
 * game.audio for it") from any particular project's content.
 */
function bootHost(archetype: BrowserArchetypeManifest, backend: FakeAudioBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(archetype.bundle)
  installDirectionalAnimation(archetype.animation ?? null)
  const game = new Game({ canvas, audio: backend })
  game.registerSceneCatalog({
    scenes: { main: archetype.blankScene },
    registry: archetype.registry,
  })
  game.loadSceneByName('main')

  // packages/editor/template/src/main.ts's exact new lines (G8): the
  // archetype declares its own music, if it has one; the host just asks.
  if (archetype.music) {
    game.audio.play(archetype.music, { channel: 'music', loop: true, scope: 'session' })
  }

  return game
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('G8 — the generic project template starts an archetype-declared music bed', () => {
  it('starts the isometric archetype\'s music on "music", looping and session-scoped', async () => {
    const backend = new FakeAudioBackend()
    const game = bootHost(ISOMETRIC_ARCHETYPE, backend)

    unlock()
    await flush()

    const musicUri = ISOMETRIC_ARCHETYPE.registry.resolveAsset?.('waica:iso-town-theme') ?? 'waica:iso-town-theme'
    expect(backend.playCalls).toEqual([{ resource: musicUri, channel: 'music', volume: 1, loop: true }])
    expect(game.audio.liveSounds()).toEqual([{ uri: musicUri, channel: 'music', scope: 'session' }])

    game.dispose()
  })

  it('starts nothing at all for an archetype with no declared music — no call, no fetch, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const backend = new FakeAudioBackend()

    expect(PLATFORMER_ARCHETYPE.music).toBeUndefined()
    const game = bootHost(PLATFORMER_ARCHETYPE, backend)

    unlock()
    await flush()

    expect(backend.loadCalls).toEqual([])
    expect(backend.playCalls).toEqual([])
    expect(game.audio.liveSounds()).toEqual([])
    expect(warn).not.toHaveBeenCalled()

    game.dispose()
  })
})
