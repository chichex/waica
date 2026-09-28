// Test support for the Viewport characterization suites: a sized canvas, a
// world-to-client mapping, shared scenes and a StrictMode mount helper. The
// suites themselves mock three's WebGLRenderer (vi.mock must stay hoisted in
// each test file).
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { vi } from 'vitest'
import { Solid, Tilemap, type Game, type SceneJson, type SceneRegistry } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import type { GridSettings } from '../project/editor-settings'
import { Viewport, type ViewportHandle } from './Viewport'

export type ViewportProps = ComponentProps<typeof Viewport>

// An 800x600 canvas with the default 12-unit view: 50 px per world unit and
// the world origin at the canvas center, so world (1, 0) is client (450, 300).
const CANVAS = { width: 800, height: 600 }

/** Client coordinates of world point (x, y) while the edit camera sits at the origin. */
export const at = (x: number, y: number): { clientX: number; clientY: number } => ({
  clientX: CANVAS.width / 2 + x * 50,
  clientY: CANVAS.height / 2 - y * 50,
})

export const REGISTRY: SceneRegistry = { components: { Solid, Tilemap } }
export const GRID: GridSettings = { type: 'square', show: true, snap: false, size: 0.5 }
export const HERO_AND_FOE: SceneJson = {
  waicaScene: 3,
  entities: [
    { name: 'Hero', position: [0, 0] },
    { name: 'Foe', position: [4, 0] },
  ],
}
export const WALL: SceneJson = {
  waicaScene: 3,
  entities: [{ name: 'Wall', position: [0, 0], components: [{ type: 'Solid', props: { width: 2, height: 2 } }] }],
}

export interface MountedViewport {
  handle(): ViewportHandle
  canvas: HTMLCanvasElement
  rerender(overrides: Partial<ViewportProps>): void
}

const BASE_PROPS: ViewportProps = {
  scene: HERO_AND_FOE,
  scenePath: 'src/scenes/main.scene.json',
  registry: REGISTRY,
  epoch: 1,
  mode: 'edit',
  grid: GRID,
  selected: null,
  onSelect: () => {},
  onMoved: () => {},
}

/** Renders a Viewport under StrictMode; later rerenders keep the first overrides. */
export function mountViewport(overrides: Partial<ViewportProps> = {}): MountedViewport {
  let current: ViewportHandle | null = null
  const ref = (instance: ViewportHandle | null): void => {
    current = instance
  }
  const element = (next: Partial<ViewportProps>) =>
    createElement(Viewport, { ...BASE_PROPS, ...overrides, ...next, ref })
  const view = render(element({}), { reactStrictMode: true })
  return {
    handle: () => defined(current, 'the viewport handle'),
    canvas: defined(view.container.querySelector('canvas'), 'the viewport canvas'),
    rerender: (next) => view.rerender(element(next)),
  }
}

export const liveGame = (mounted: MountedViewport): Game => defined(mounted.handle().game(), 'the live Game')

export interface DragOptions {
  from: [number, number]
  to: [number, number]
  shiftKey?: boolean
}

/** One pointer drag across the canvas, between two world points. */
export function drag(canvas: HTMLCanvasElement, { from, to, shiftKey = false }: DragOptions): void {
  fireEvent.pointerDown(canvas, { ...at(...from), pointerId: 1, shiftKey })
  fireEvent.pointerMove(canvas, { ...at(...to), pointerId: 1, shiftKey })
  fireEvent.pointerUp(canvas, { ...at(...to), pointerId: 1, shiftKey })
}

/** Gives every canvas a laid-out size, so the Game sizes its camera and toWorld can map clicks. */
export function installViewportHost(): void {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => CANVAS.width })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => CANVAS.height })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, ...CANVAS }),
  )
}

export function removeViewportHost(): void {
  cleanup()
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientHeight')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
}
