// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every Game builds one WebGLRenderer and disposes it in game.dispose(), so
// renderers built minus renderers disposed is the number of live Games.
const renderers = vi.hoisted(() => ({ built: 0, disposed: 0 }))

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
        renderers.built += 1
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
      dispose(): void {
        renderers.disposed += 1
      }
    }
    return { ...actual, WebGLRenderer }
  },
)

import type { SceneJson, SceneRegistry } from '@waica/engine'
import { Viewport } from './Viewport'

const REGISTRY: SceneRegistry = { components: {} }
const SCENE: SceneJson = { waicaScene: 3, entities: [{ name: 'Hero' }] }

function viewport(epoch: number, mode: 'edit' | 'play') {
  return (
    <Viewport
      scene={SCENE}
      scenePath="src/scenes/main.scene.json"
      registry={REGISTRY}
      epoch={epoch}
      mode={mode}
      selected={null}
      onSelect={() => {}}
      onMoved={() => {}}
    />
  )
}

const live = (): number => renderers.built - renderers.disposed

beforeEach(() => {
  renderers.built = 0
  renderers.disposed = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Viewport under StrictMode (CA-22)', () => {
  it('keeps exactly one live Game through StrictMode mount, unmount and remount', () => {
    const { unmount } = render(viewport(1, 'edit'), { reactStrictMode: true })
    expect(live()).toBe(1)

    unmount()
    expect(live()).toBe(0)

    render(viewport(1, 'edit'), { reactStrictMode: true })
    expect(live()).toBe(1)
  })

  it('replaces the Game on a new epoch or mode, never leaving two alive', () => {
    const { rerender } = render(viewport(1, 'edit'), { reactStrictMode: true })
    const builtBefore = renderers.built

    rerender(viewport(2, 'edit'))
    expect(live()).toBe(1)
    rerender(viewport(2, 'play'))
    expect(live()).toBe(1)
    expect(renderers.built).toBe(builtBefore + 2)
  })
})
