// @vitest-environment happy-dom
import { createEvent, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Same seam as viewport-scene-swap.test.tsx: happy-dom hosts no GPU, so the
// engine's own copy of three gets the shared fake renderer, which records the loop.
vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import type { SceneJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import { at, drag, GRID, installViewportHost, liveGame, mountViewport, removeViewportHost, HERO_AND_FOE, WALL } from './test-viewport'

beforeEach(installViewportHost)
afterEach(removeViewportHost)

describe('Viewport entity selection and drag', () => {
  it('selects the clicked entity and commits its drag on pointer-up', () => {
    const onSelect = vi.fn()
    const onMoved = vi.fn()
    const mounted = mountViewport({ onSelect, onMoved })

    drag(mounted.canvas, { from: [0, 0], to: [1, -2] })

    expect(onSelect).toHaveBeenCalledWith('Hero')
    expect(onMoved).toHaveBeenCalledWith('Hero', [1, -2])
  })

  it('keeps the z of a 3-number position while dragging in the XY plane', () => {
    const mounted = mountViewport({ scene: { waicaScene: 3, entities: [{ name: 'Hero', position: [0, 0, 5] }] } })

    fireEvent.pointerDown(mounted.canvas, { ...at(0, 0), pointerId: 1 })
    fireEvent.pointerMove(mounted.canvas, { ...at(1, -2), pointerId: 1 })

    expect(defined(liveGame(mounted).find('Hero')).position.toArray()).toEqual([1, -2, 5])
  })

  it('snaps the dragged entity to the grid when snapping is on', () => {
    const onMoved = vi.fn()
    const mounted = mountViewport({ onMoved, grid: { ...GRID, snap: true } })

    drag(mounted.canvas, { from: [0, 0], to: [1.2, 0.9] })

    expect(onMoved).toHaveBeenCalledWith('Hero', [1, 1])
  })

  it('toggles an entity in the multi-selection on Shift-click', () => {
    const onSelect = vi.fn()
    const onToggleSelect = vi.fn()
    const mounted = mountViewport({ onSelect, onToggleSelect })

    fireEvent.pointerDown(mounted.canvas, { ...at(4, 0), pointerId: 1, shiftKey: true })
    fireEvent.pointerUp(mounted.canvas, { ...at(4, 0), pointerId: 1 })

    expect(onToggleSelect).toHaveBeenCalledWith('Foe')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('drags the whole multi-selection as one move', () => {
    const onMovedMany = vi.fn()
    const mounted = mountViewport({ multiSelected: ['Hero', 'Foe'], onMovedMany })

    drag(mounted.canvas, { from: [0, 0], to: [0, 1] })

    expect(onMovedMany).toHaveBeenCalledWith([
      { name: 'Hero', position: [0, 1] },
      { name: 'Foe', position: [4, 1] },
    ])
  })
})

describe('Viewport marquee selection', () => {
  it('selects the entities inside a Shift-drag rectangle', () => {
    const onRangeSelect = vi.fn()
    const mounted = mountViewport({ onRangeSelect })

    drag(mounted.canvas, { from: [-2, 2], to: [2, -2], shiftKey: true })

    expect(onRangeSelect).toHaveBeenCalledWith(['Hero'])
  })

  it('clears the selection when the rectangle catches nothing', () => {
    const onSelect = vi.fn()
    const onRangeSelect = vi.fn()
    const mounted = mountViewport({ onSelect, onRangeSelect })

    drag(mounted.canvas, { from: [-7, 5], to: [-6, 4], shiftKey: true })

    expect(onRangeSelect).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

describe('Viewport component box editing', () => {
  it('resizes a collision box from a corner, pinning the opposite one', () => {
    const onBoxResized = vi.fn()
    const mounted = mountViewport({ scene: WALL, selected: 'Wall', onBoxResized })

    drag(mounted.canvas, { from: [1.1, 1.1], to: [2, 2] })

    expect(onBoxResized).toHaveBeenCalledWith('Wall', 'Solid', [3, 3], [0.5, 0.5])
  })

  it('moves a collision box by dragging its outline', () => {
    const onBoxMoved = vi.fn()
    const mounted = mountViewport({ scene: WALL, selected: 'Wall', onBoxMoved })

    drag(mounted.canvas, { from: [1, 0], to: [2, -1] })

    expect(onBoxMoved).toHaveBeenCalledWith('Wall', 'Solid', [1, -1])
  })

  it('moves one freeform polygon vertex', () => {
    const onPolygonChanged = vi.fn()
    const scene: SceneJson = {
      waicaScene: 3,
      entities: [{
        name: 'Wall',
        components: [{
          type: 'Solid',
          props: { width: 2, height: 2, shape: 'polygon', points: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] },
        }],
      }],
    }
    const mounted = mountViewport({ scene, selected: 'Wall', onPolygonChanged })

    drag(mounted.canvas, { from: [-1, -1], to: [-2, -1] })

    expect(onPolygonChanged).toHaveBeenCalledWith('Wall', 'Solid', [[-1, -0.5], [0.5, -0.5], [0, 0.5]])
  })

})

describe('Viewport component box hover and visibility', () => {
  it('shows resize and move cursors when hovering handles and outlines', () => {
    const mounted = mountViewport({ scene: WALL, selected: 'Wall' })

    fireEvent.pointerMove(mounted.canvas, at(1.1, 1.1))
    expect(mounted.canvas.style.cursor).toBe('nesw-resize')
    fireEvent.pointerMove(mounted.canvas, at(1, -1))
    expect(mounted.canvas.style.cursor).toBe('nwse-resize')
    fireEvent.pointerMove(mounted.canvas, at(1, 0))
    expect(mounted.canvas.style.cursor).toBe('move')
    fireEvent.pointerMove(mounted.canvas, at(5, 5))
    expect(mounted.canvas.style.cursor).toBe('')
  })

  it('stops editing a box whose layer is hidden', () => {
    const onBoxResized = vi.fn()
    const onSelect = vi.fn()
    const mounted = mountViewport({
      scene: WALL,
      selected: 'Wall',
      componentVisibility: { appearance: true, collision: false },
      onBoxResized,
      onSelect,
    })

    drag(mounted.canvas, { from: [1, 1], to: [2, 2] })

    expect(onBoxResized).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('Wall')
  })
})

describe('Viewport scene camera gizmo', () => {
  it('selects the scene camera from its marker and commits its drag', () => {
    const onSelectCamera = vi.fn()
    const onCameraMoved = vi.fn()
    const scene: SceneJson = { ...HERO_AND_FOE, camera: { position: [3, 4], zoom: 12 } }
    const mounted = mountViewport({ scene, showCamera: true, onSelectCamera, onCameraMoved })

    // Seeded from the scene camera, so its marker sits at the canvas center.
    fireEvent.pointerDown(mounted.canvas, { ...at(0, 0), pointerId: 1 })
    fireEvent.pointerMove(mounted.canvas, { ...at(1, -1), pointerId: 1 })
    fireEvent.pointerUp(mounted.canvas, { ...at(1, -1), pointerId: 1 })

    expect(onSelectCamera).toHaveBeenCalled()
    expect(onCameraMoved).toHaveBeenCalledWith([4, 3])
  })
})

describe('Viewport tilemap painting', () => {
  it('paints the selected tile across cells and commits the stroke on pointer-up', () => {
    const onTilemapStroke = vi.fn()
    const scene: SceneJson = {
      waicaScene: 3,
      entities: [{ name: 'Map', components: [{ type: 'Tilemap', props: { mapWidth: 2, mapHeight: 1, cells: [-1, -1] } }] }],
    }
    const mounted = mountViewport({
      scene,
      selected: 'Map',
      tilemapBrush: { entity: 'Map', tile: 3, paint: true },
      onTilemapStroke,
    })

    drag(mounted.canvas, { from: [0.5, 0.5], to: [1.5, 0.5] })

    expect(onTilemapStroke).toHaveBeenCalledWith('Map', [3, 3])
  })
})

describe('Viewport prefab drop', () => {
  it('drops a prefab at the logical world point under the pointer', () => {
    const onDropPrefab = vi.fn()
    const mounted = mountViewport({ onDropPrefab })
    const dataTransfer = { getData: (type: string) => (type === 'waica/prefab' ? 'characters/slime' : '') }
    // happy-dom's DragEvent drops pointer coordinates from its init, so they are set on the event.
    const drop = createEvent.drop(mounted.canvas, { dataTransfer })
    for (const [key, value] of Object.entries(at(1, -1))) Object.defineProperty(drop, key, { value })

    fireEvent(mounted.canvas, drop)

    expect(onDropPrefab).toHaveBeenCalledWith('characters/slime', [1, -1])
  })
})

