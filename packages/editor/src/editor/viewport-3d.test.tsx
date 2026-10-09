// @vitest-environment happy-dom
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { THREE, type Game, type SceneJson } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { at, drag, GRID, HERO_AND_FOE, installViewportHost, liveGame, mountViewport, REGISTRY, removeViewportHost } from './test-viewport'
import { frameEditView } from './viewport-game'
import type { EditCamera, ViewportLive } from './viewport-live'

const SCENE_3D: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0], fov: 50 },
  entities: [{ name: 'Hero', position: [0, 0, 0] }, { name: 'Foe', position: [4, 0, -2], rotation: [0, 45, 0], scale: [1, 2, 1] }],
}

beforeEach(installViewportHost)
afterEach(removeViewportHost)

/** Lets the live Game's renderer init settle, then runs one frame of its loop. */
async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const loop = fakeRendering.renderers.find((renderer) => !renderer.disposed && renderer.loop)?.loop
  if (!loop) throw new Error('the Viewport started no Game loop')
  act(() => loop(16))
}

function perspectiveOf(game: Game): THREE.PerspectiveCamera {
  if (!(game.camera instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective camera')
  return game.camera
}

describe('Viewport on a 3D scene (CA-21)', () => {
  it('builds the Game with the scene camera: perspective, untouched by the edit pan and zoom', async () => {
    const mounted = mountViewport({ scene: SCENE_3D, showCamera: true, viewHeight: 12 })
    await tick()
    const game = liveGame(mounted)
    expect(game.space).toBe('3d')
    const camera = perspectiveOf(game)
    expect(camera.position.toArray()).toEqual([0, 4, 12])
    expect(camera.fov).toBe(50)
    expect(camera.aspect).toBeCloseTo(800 / 600)
  })

  it('runs the scene in Play with the same camera', async () => {
    const mounted = mountViewport({ scene: SCENE_3D, mode: 'play' })
    await tick()
    const game = liveGame(mounted)
    expect(game.simulate).toBe(true)
    expect(perspectiveOf(game).position.toArray()).toEqual([0, 4, 12])
  })

})

describe('Viewport gestures on a 3D scene (CA-21)', () => {
  it('selects and moves nothing: clicks, drags and the marquee yield no gesture', async () => {
    const onSelect = vi.fn()
    const onMoved = vi.fn()
    const onRangeSelect = vi.fn()
    const onCameraMoved = vi.fn()
    const mounted = mountViewport({ scene: SCENE_3D, showCamera: true, onSelect, onMoved, onRangeSelect, onCameraMoved })
    await tick()
    drag(mounted.canvas, { from: [0, 0], to: [1, -2] })
    drag(mounted.canvas, { from: [-2, 2], to: [2, -2], shiftKey: true })
    fireEvent.pointerDown(mounted.canvas, { ...at(4, 0), pointerId: 1 })
    fireEvent.pointerUp(mounted.canvas, { ...at(4, 0), pointerId: 1 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onMoved).not.toHaveBeenCalled()
    expect(onRangeSelect).not.toHaveBeenCalled()
    expect(onCameraMoved).not.toHaveBeenCalled()
    expect(perspectiveOf(liveGame(mounted)).position.toArray()).toEqual([0, 4, 12])
  })

  it('does not zoom the view on the wheel', async () => {
    const mounted = mountViewport({ scene: SCENE_3D })
    await tick()
    const camera = perspectiveOf(liveGame(mounted))
    const before = [...camera.projectionMatrix.elements, ...camera.position.toArray()]
    fireEvent.wheel(mounted.canvas, { deltaY: 120 })
    fireEvent.wheel(mounted.canvas, { deltaY: -120 })
    expect([...camera.projectionMatrix.elements, ...camera.position.toArray()]).toEqual(before)
  })

})

describe('Viewport chrome on a 3D scene (CA-21)', () => {
  it('hides the grid and navigation tools', async () => {
    const mounted = mountViewport({ scene: SCENE_3D, showCamera: true, onGridChange: () => {} })
    await tick()
    expect(mounted.canvas).toBeTruthy()
    expect(screen.queryByTitle('Show grid')).toBeNull()
    expect(screen.queryByTitle('Zoom in')).toBeNull()
    expect(screen.queryByTitle("Go to the scene camera's framing")).toBeNull()
  })

  it('shows those tools on a 2D scene, as before', async () => {
    mountViewport({ scene: HERO_AND_FOE, showCamera: true, onGridChange: () => {} })
    await tick()
    expect(screen.queryByTitle('Show grid')).not.toBeNull()
    expect(screen.queryByTitle('Zoom in')).not.toBeNull()
  })

  it('draws no grid, gizmo or UI preview: every overlay stays hidden', async () => {
    const mounted = mountViewport({ scene: SCENE_3D, showCamera: true, selected: 'Hero', grid: { ...GRID, show: true } })
    await tick()
    const game = liveGame(mounted)
    const owned = new Set<THREE.Object3D>(game.entities.map((entity) => entity.node))
    const overlays = game.scene.children.filter((child) => !owned.has(child) && child.name !== 'waica:sprite-batches')
    expect(overlays.length).toBeGreaterThan(0)
    for (const overlay of overlays) expect(overlay.visible, overlay.type).toBe(false)
    expect(document.querySelector<HTMLElement>('.ed-vp-ui')).toBeNull()
  })

})

describe('Viewport drops and scene swaps on a 3D scene (CA-21)', () => {
  it('ignores a prefab drop', async () => {
    const onDropPrefab = vi.fn()
    const mounted = mountViewport({ scene: SCENE_3D, onDropPrefab })
    await tick()
    const dataTransfer = { getData: (type: string) => (type === 'waica/prefab' ? 'objects/crate' : ''), dropEffect: 'none' }
    fireEvent.drop(mounted.canvas, { ...at(1, 1), dataTransfer })
    expect(onDropPrefab).not.toHaveBeenCalled()
  })

  it('still accepts a prefab drop on a 2D scene', async () => {
    const onDropPrefab = vi.fn()
    const mounted = mountViewport({ scene: HERO_AND_FOE, onDropPrefab })
    await tick()
    const dataTransfer = { getData: (type: string) => (type === 'waica/prefab' ? 'objects/crate' : ''), dropEffect: 'none' }
    fireEvent.drop(mounted.canvas, { ...at(1, 1), dataTransfer })
    expect(onDropPrefab).toHaveBeenCalledWith('objects/crate', expect.any(Array))
  })

  it('opens a 3D scene over a 2D one and back, framing each with its own camera', async () => {
    const mounted = mountViewport({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json' })
    await tick()
    const game = liveGame(mounted)
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
    mounted.rerender({ scene: SCENE_3D, scenePath: 'src/scenes/b.scene.json' })
    await tick()
    expect(liveGame(mounted)).toBe(game)
    expect(perspectiveOf(game).position.toArray()).toEqual([0, 4, 12])
    mounted.rerender({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json' })
    await tick()
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
  })
})

describe('Viewport camera edits on a 3D scene (CA-21)', () => {
  it('places the live perspective camera when the scene camera block changes', async () => {
    const mounted = mountViewport({ scene: SCENE_3D })
    await tick()
    const game = liveGame(mounted)
    mounted.rerender({ scene: { ...SCENE_3D, camera: { kind: 'perspective', position: [3, 2, 1], target: [0, 1, 0], fov: 30 } } })
    await tick()
    expect(liveGame(mounted)).toBe(game)
    const camera = perspectiveOf(game)
    expect(camera.position.toArray()).toEqual([3, 2, 1])
    expect(camera.fov).toBe(30)
  })

  it('does not re-place the camera for an edit that leaves the camera block alone', async () => {
    const mounted = mountViewport({ scene: SCENE_3D })
    await tick()
    const game = liveGame(mounted)
    perspectiveOf(game).position.x = 9
    mounted.rerender({ scene: { ...SCENE_3D, entities: [...SCENE_3D.entities, { name: 'Extra', position: [1, 1, 1] }] } })
    await tick()
    expect(perspectiveOf(game).position.x).toBe(9)
  })

  it('leaves a 2D scene to its overlays: a camera edit does not move the live camera', async () => {
    const mounted = mountViewport({ scene: HERO_AND_FOE })
    await tick()
    const game = liveGame(mounted)
    const before = game.camera.position.toArray()
    mounted.rerender({ scene: { ...HERO_AND_FOE, camera: { position: [6, 6], zoom: 20 } } })
    await tick()
    expect(game.camera.position.toArray()).toEqual(before)
  })
})

describe('frameEditView on a 3D scene (CA-21)', () => {
  it('leaves the edit camera alone: the perspective pose is not an EditCamera', async () => {
    const mounted = mountViewport({ scene: SCENE_3D })
    await tick()
    const live: ViewportLive = {
      scene: SCENE_3D,
      registry: REGISTRY,
      selected: null,
      mode: 'edit',
      grid: GRID,
      componentVisibility: { appearance: true, collision: true },
    }
    const camRef: { current: EditCamera } = { current: { x: 2, y: 3, view: 7 } }
    frameEditView({ gameRef: { current: liveGame(mounted) }, liveRef: { current: live }, camRef })
    expect(camRef.current).toEqual({ x: 2, y: 3, view: 7 })
  })
})
