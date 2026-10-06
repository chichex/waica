// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every Game builds one WebGPURenderer and disposes it in game.dispose(), so
// renderers built minus renderers disposed is the number of live Games.
vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import type { SceneJson, SceneRegistry } from '@waica/engine'
import { fakeRendering, resetFakeRendering } from '../../../engine/src/test-renderer'
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

const live = (): number => fakeRendering.renderers.filter((renderer) => !renderer.disposed).length

/** Lets every pending renderer init, and the work queued behind it, settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  resetFakeRendering()
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
  it('keeps exactly one live Game through StrictMode mount, unmount and remount', async () => {
    const { unmount } = render(viewport(1, 'edit'), { reactStrictMode: true })
    await settle()
    expect(live()).toBe(1)

    unmount()
    await settle()
    expect(live()).toBe(0)

    render(viewport(1, 'edit'), { reactStrictMode: true })
    await settle()
    expect(live()).toBe(1)
  })

  it('replaces the Game on a new epoch or mode, never leaving two alive', async () => {
    const { rerender } = render(viewport(1, 'edit'), { reactStrictMode: true })
    await settle()
    const builtBefore = fakeRendering.renderers.length

    rerender(viewport(2, 'edit'))
    await settle()
    expect(live()).toBe(1)
    rerender(viewport(2, 'play'))
    await settle()
    expect(live()).toBe(1)
    expect(fakeRendering.renderers.length).toBe(builtBefore + 2)
  })
})

describe('Viewport canvases (review #2)', () => {
  it('gives every Game its own canvas, so disposing one never loses the live Game\'s context', async () => {
    const { rerender } = render(viewport(1, 'edit'), { reactStrictMode: true })
    await settle()
    rerender(viewport(1, 'play'))
    await settle()
    rerender(viewport(1, 'edit'))
    await settle()

    const live = fakeRendering.renderers.filter((renderer) => !renderer.disposed)
    expect(live).toHaveLength(1)
    const canvas = live[0]?.domElement
    expect(canvas && fakeRendering.lostCanvases.has(canvas)).toBe(false)
    expect(canvas?.isConnected).toBe(true)
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
  })
})

describe('Viewport and game.ready() (ADR 0025, CA-7)', () => {
  it('starts the loop only once the renderer is ready', async () => {
    fakeRendering.init = 'pending'
    render(viewport(1, 'edit'), { reactStrictMode: true })
    const current = fakeRendering.renderers.filter((renderer) => !renderer.disposed)
    expect(current.every((renderer) => renderer.loop === null)).toBe(true)

    for (const renderer of fakeRendering.renderers) renderer.resolveInit('webgpu')
    await settle()

    const running = fakeRendering.renderers.filter((renderer) => renderer.loop !== null)
    expect(running).toHaveLength(1)
    expect(running[0]?.disposed).toBe(false)
  })

  it('disposes a Game whose ready() is still pending under the StrictMode double mount, with no loop and no error', async () => {
    fakeRendering.init = 'pending'
    const errors = vi.spyOn(console, 'error')
    const { unmount } = render(viewport(1, 'edit'), { reactStrictMode: true })
    unmount()

    for (const renderer of fakeRendering.renderers) renderer.resolveInit('webgpu')
    await settle()

    expect(fakeRendering.renderers.length).toBeGreaterThan(0)
    expect(fakeRendering.renderers.every((renderer) => renderer.disposed && renderer.loop === null)).toBe(true)
    expect(errors).not.toHaveBeenCalled()
  })

})

describe('Viewport and a renderer that cannot initialize (ADR 0025)', () => {
  it('stays quiet about a renderer that fails after its Game was disposed', async () => {
    fakeRendering.init = 'pending'
    const errors = vi.spyOn(console, 'error')
    const { unmount } = render(viewport(1, 'edit'), { reactStrictMode: true })
    unmount()

    for (const renderer of fakeRendering.renderers) renderer.rejectInit(new Error('no adapter'))
    await settle()

    expect(fakeRendering.renderers.every((renderer) => renderer.loop === null)).toBe(true)
    expect(errors).not.toHaveBeenCalled()
  })

  it('reports a live Game whose renderer cannot initialize', async () => {
    fakeRendering.init = new Error('no adapter')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(viewport(1, 'edit'), { reactStrictMode: true })
    await settle()

    expect(errors).toHaveBeenCalledWith(expect.stringContaining('[waica]'), expect.objectContaining({ message: expect.stringMatching(/webgpu.*webgl2/) as unknown }))
    expect(fakeRendering.renderers.every((renderer) => renderer.loop === null)).toBe(true)
  })
})
