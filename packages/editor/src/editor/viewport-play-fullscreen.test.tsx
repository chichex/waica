// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Viewport.tsx pulls THREE through @waica/engine's re-export, so the mock
// targets the engine's own copy of three, like viewport-play-music.test.tsx.
vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import type { SceneJson, SceneRegistry } from '@waica/engine'
import { Viewport, type ViewportHandle } from './Viewport'
import { defined } from '../../../engine/src/test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const REGISTRY: SceneRegistry = { components: {} }
const SCENE: SceneJson = { waicaScene: 3, entities: [{ name: 'A' }] }

/** The Viewport in Play over SCENE, under StrictMode; the box holds its handle. */
function renderPlay(root: Root): { current: ViewportHandle | null } {
  const box: { current: ViewportHandle | null } = { current: null }
  act(() => {
    root.render(
      createElement(StrictMode, null, <Viewport
        ref={(instance) => {
          box.current = instance
        }}
        scene={SCENE}
        scenePath="src/scenes/a.scene.json"
        registry={REGISTRY}
        epoch={1}
        mode="play"
        selected={null}
        onSelect={() => {}}
        onMoved={() => {}}
      />),
    )
  })
  return box
}

/**
 * Review of PR 214: the editor's Play runs the Game inside the editor's own
 * page, so a game's `setFullscreen(true)` must fill the screen with the
 * Viewport's surface, never with the toolbar, Explorer, Inspector and code.
 */
describe('game.setFullscreen() in the editor Play', () => {
  let container: HTMLDivElement
  let root: Root
  const targets: Element[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    targets.length = 0
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value(this: Element) {
        targets.push(this)
        return Promise.resolve()
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
    Reflect.deleteProperty(Element.prototype, 'requestFullscreen')
  })

  it("fills the screen with the Viewport's surface, not the whole editor", async () => {
    const box = renderPlay(root)

    await defined(defined(box.current).game()).setFullscreen(true)

    const canvas = defined(container.querySelector('canvas'))
    expect(targets).toEqual([canvas.parentElement])
    expect(targets).not.toContain(document.documentElement)
  })
})
