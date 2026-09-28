// @vitest-environment happy-dom
import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Same seam as viewport-scene-swap.test.tsx: happy-dom cannot host WebGL, so
// the engine's own copy of three gets a renderer that only records the loop.
const rendererHooks = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
}))

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
      setAnimationLoop(loop: ((time: number) => void) | null): void {
        rendererHooks.loop = loop
      }
      dispose(): void {}
    }
    return { ...actual, WebGLRenderer }
  },
)

import { Solid, type SceneJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import {
  drag,
  HERO_AND_FOE,
  installViewportHost,
  liveGame,
  mountViewport,
  REGISTRY,
  WALL,
  removeViewportHost,
} from './test-viewport'

const tick = (): void => act(() => rendererHooks.loop?.(16))

/** GameUi mounts each piece in an open shadow root, out of reach of screen queries; counts the shown ones. */
const shownCopies = (text: string): number =>
  [...document.querySelectorAll('*')].filter(
    (element) => element.shadowRoot?.textContent?.includes(text) && !hiddenByStyle(element),
  ).length

function hiddenByStyle(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return element.style.display === 'none' || hiddenByStyle(element.parentElement)
}

beforeEach(() => {
  rendererHooks.loop = null
  installViewportHost()
})

afterEach(removeViewportHost)

describe('Viewport overlay controls', () => {
  it('offers zoom, camera framing and grid tools in edit mode', () => {
    mountViewport({ showCamera: true, onGridChange: () => {} })

    expect(screen.getByRole('button', { description: 'Zoom in' })).toBeDefined()
    expect(screen.getByRole('button', { description: 'Zoom out' })).toBeDefined()
    expect(screen.getByRole('button', { description: "Go to the scene camera's framing" })).toBeDefined()
    expect(screen.getByRole('button', { description: 'Show grid' })).toBeDefined()
    expect(screen.getByRole('button', { description: 'Snap to grid (hold Shift to invert)' })).toBeDefined()
    expect(screen.getByRole('spinbutton', { name: 'Grid cell size (world units)' })).toHaveProperty('value', '0.5')
  })

  it('hides camera framing and grid tools when their props are absent', () => {
    mountViewport()

    expect(screen.getByRole('button', { description: 'Zoom in' })).toBeDefined()
    expect(screen.queryByRole('button', { description: "Go to the scene camera's framing" })).toBeNull()
    expect(screen.queryByRole('button', { description: 'Show grid' })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('shows no editor controls in play mode', () => {
    mountViewport({ mode: 'play', showCamera: true, onGridChange: () => {} })

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

describe('Viewport grid tools', () => {
  it('toggles grid visibility and snapping through onGridChange', async () => {
    const user = userEvent.setup()
    const onGridChange = vi.fn()
    mountViewport({ onGridChange })

    await user.click(screen.getByRole('button', { description: 'Show grid' }))
    expect(onGridChange).toHaveBeenLastCalledWith({ type: 'square', show: false, snap: false, size: 0.5 })
    await user.click(screen.getByRole('button', { description: 'Snap to grid (hold Shift to invert)' }))
    expect(onGridChange).toHaveBeenLastCalledWith({ type: 'square', show: true, snap: true, size: 0.5 })
  })

  it('commits a valid cell size and ignores sizes below the minimum', async () => {
    const user = userEvent.setup()
    const onGridChange = vi.fn()
    mountViewport({ onGridChange })
    const size = screen.getByRole('spinbutton', { name: 'Grid cell size (world units)' })

    await user.clear(size)
    expect(onGridChange).not.toHaveBeenCalled()
    await user.type(size, '2')
    expect(onGridChange).toHaveBeenLastCalledWith({ type: 'square', show: true, snap: false, size: 2 })
  })
})

describe('Viewport imperative handle', () => {
  it('exposes the live Game with the scene loaded', () => {
    const mounted = mountViewport()

    expect(liveGame(mounted).find('Hero')).toBeDefined()
    expect(liveGame(mounted).find('Foe')).toBeDefined()
  })

  it('moves an entity and sets a component prop on the live Game', () => {
    const mounted = mountViewport({ scene: WALL })

    mounted.handle().applyMove('Wall', 3, -2)
    mounted.handle().applyProp('Wall', 'Solid', 'width', 5)

    const wall = defined(liveGame(mounted).find('Wall'))
    expect([wall.position.x, wall.position.y]).toEqual([3, -2])
    expect(defined(wall.get(Solid)).width).toBe(5)
  })
})

describe('Viewport navigation', () => {
  it('zooms with the buttons and the wheel', async () => {
    const user = userEvent.setup()
    const mounted = mountViewport()

    await user.click(screen.getByRole('button', { description: 'Zoom in' }))
    expect(liveGame(mounted).view).toBeCloseTo(9.6)
    await user.click(screen.getByRole('button', { description: 'Zoom out' }))
    expect(liveGame(mounted).view).toBeCloseTo(12)
    fireEvent.wheel(mounted.canvas, { deltaY: 1 })
    expect(liveGame(mounted).view).toBeCloseTo(13.2)
  })

  it("jumps to the scene camera's framing", async () => {
    const user = userEvent.setup()
    const scene: SceneJson = { ...HERO_AND_FOE, camera: { position: [3, 4], zoom: 10 } }
    const mounted = mountViewport({ scene, showCamera: true })
    const game = liveGame(mounted)
    game.camera.position.set(-5, -5, game.camera.position.z)
    await user.click(screen.getByRole('button', { description: 'Zoom in' }))

    await user.click(screen.getByRole('button', { description: "Go to the scene camera's framing" }))

    expect([game.camera.position.x, game.camera.position.y, game.view]).toEqual([3, 4, 10])
  })

  it('pans the edit camera by dragging empty space, clearing the selection', () => {
    const onSelect = vi.fn()
    const mounted = mountViewport({ onSelect })

    drag(mounted.canvas, { from: [-6, 4], to: [-5, 4] })

    expect(onSelect).toHaveBeenCalledWith(null)
    expect(liveGame(mounted).camera.position.x).toBeCloseTo(-1)
  })

  it('keeps the edit camera pan across a Play round trip', () => {
    const mounted = mountViewport()
    drag(mounted.canvas, { from: [-6, 4], to: [-5, 2] })
    tick()

    mounted.rerender({ mode: 'play' })
    mounted.rerender({ mode: 'edit' })

    const camera = liveGame(mounted).camera.position
    expect([camera.x, camera.y]).toEqual([-1, 2])
  })
})

describe('Viewport per-frame editor overlays', () => {
  it("hides the selected entity's appearance while its layer is hidden", () => {
    const mounted = mountViewport({ selected: 'Hero', componentVisibility: { appearance: false, collision: true } })
    const hero = defined(liveGame(mounted).find('Hero'))

    tick()
    expect(hero.node.visible).toBe(false)
    mounted.rerender({ componentVisibility: { appearance: true, collision: true } })
    tick()
    expect(hero.node.visible).toBe(true)
  })

  it("previews the scene's UI pieces inside the camera frame in edit mode", () => {
    const scene: SceneJson = { ...HERO_AND_FOE, camera: { position: [0, 0], zoom: 12 }, ui: ['hud'] }
    const mounted = mountViewport({ scene, showCamera: true, registry: { ...REGISTRY, ui: { hud: '<p>Score panel</p>' } } })

    // The live Game mounts its own copy hidden in edit mode; the shown one is the preview.
    tick()
    expect(shownCopies('Score panel')).toBe(1)
    mounted.rerender({ scene: { ...scene, ui: [] } })
    tick()
    expect(shownCopies('Score panel')).toBe(0)
  })
})
