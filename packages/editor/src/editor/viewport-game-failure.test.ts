// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A real Game builds a three.js renderer; happy-dom has no GPU, so the mock
// targets the engine's own copy of three (see viewport-scene-swap.test.tsx).
vi.mock(
  new URL('../../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Game, loadScene, type GameOptions } from '@waica/engine'
import { startFailureMessage } from './viewport-game'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function gameOver(extra: Partial<GameOptions>): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas, ...extra })
}

describe('what the editor logs when a Game cannot start (PR #161 review)', () => {
  it('blames the physics load when that is what failed, so the renderer is not suspected', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = gameOver({ physics: () => Promise.reject(new Error('wasm blocked')) })
    loadScene(game, { waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective' }, entities: [{ name: 'Lone' }] }, { components: {} })
    await game.assets.ready()

    expect(game.physics.state).toBe('failed')
    expect(startFailureMessage(game)).toBe('[waica] the viewport cannot simulate: the physics module failed to load')
  })

  it('blames the renderer otherwise', () => {
    const game = gameOver({})
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Lone' }] }, { components: {} })

    expect(startFailureMessage(game)).toBe('[waica] the viewport cannot draw')
  })
})
