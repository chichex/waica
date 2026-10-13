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

import { THREE, type SceneJson } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { at, GRID, HERO_AND_FOE, installViewportHost, liveGame, mountViewport, REGISTRY, removeViewportHost } from './test-viewport'
import { frameEditView } from './viewport-game'
import type { EditCamera, ViewportLive } from './viewport-live'
import { loadCameraPose, saveCameraPose } from './workspace'

const SCENE_3D: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0], fov: 50 },
  entities: [{ name: 'Hero', position: [0, 0, 0] }, { name: 'Foe', position: [4, 0, -2], rotation: [0, 45, 0], scale: [1, 2, 1] }],
}
const SCENE_PATH = 'src/scenes/main.scene.json'

const storage = new Map<string, string>()

beforeEach(() => {
  installViewportHost()
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  })
})
afterEach(removeViewportHost)

const liveLoop = (): ((time: number) => void) | null | undefined =>
  fakeRendering.renderers.find((renderer) => !renderer.disposed && renderer.loop)?.loop

/**
 * Lets the live Game's renderer init and its physics module (a 3D scene loads
 * Rapier before `game.ready()` resolves) settle, then runs one frame of its loop.
 */
async function tick(): Promise<void> {
  await act(async () => {
    await vi.waitFor(
      () => {
        if (!liveLoop()) throw new Error('the Viewport started no Game loop')
      },
      { timeout: 5_000 },
    )
  })
  const loop = liveLoop()
  if (!loop) throw new Error('the Viewport started no Game loop')
  act(() => loop(16))
}

function perspectiveOf(camera: unknown): THREE.PerspectiveCamera {
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected a perspective camera')
  return camera
}

const round = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1000) / 1000 + 0)
const surface = (): HTMLElement => defined(document.querySelector<HTMLElement>('.ed-viewport'), 'the viewport element')
const targetOf = (camera: THREE.PerspectiveCamera, distance: number): number[] =>
  round(camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), distance).toArray())

/** Presses `key` on the focused viewport element. */
function press(key: string, modifiers: { shiftKey?: boolean } = {}): void {
  surface().focus()
  fireEvent.keyDown(surface(), { key, ...modifiers })
}

async function mount3d(overrides: Parameters<typeof mountViewport>[0] = {}) {
  const mounted = mountViewport({ scene: SCENE_3D, scenePath: SCENE_PATH, project: 'game', showCamera: true, onGridChange: () => {}, ...overrides })
  await tick()
  return { mounted, game: liveGame(mounted) }
}

describe('the editor camera over a 3D scene (issue #173 CA-9)', () => {
  it('draws edit mode through an editor-owned camera that starts as the scene camera', async () => {
    const { game } = await mount3d()
    const editor = perspectiveOf(game.camera)
    const scene = perspectiveOf(game.cameraRig.sceneCamera)

    expect(editor).not.toBe(scene)
    expect(round(editor.position.toArray())).toEqual([0, 4, 12])
    expect(targetOf(editor, Math.hypot(4, 12))).toEqual([0, 0, 0])
    expect([editor.fov, editor.near, editor.far]).toEqual([50, 0.1, 1000])
    expect(defined(fakeRendering.draws.at(-1), 'a render call').camera).toBe(editor)
  })

  it('draws Play through the scene camera, with no view camera', async () => {
    const { game } = await mount3d({ mode: 'play' })
    expect(game.simulate).toBe(true)
    expect(game.camera).toBe(game.cameraRig.sceneCamera)
    expect(perspectiveOf(game.camera).position.toArray()).toEqual([0, 4, 12])
  })

})

describe('the scene camera beside the editor camera (issue #173 CA-9)', () => {
  it("navigates without touching the scene JSON's camera or the scene camera", async () => {
    const onCameraMoved = vi.fn()
    const onMoved = vi.fn()
    const before = structuredClone(SCENE_3D)
    const { mounted, game } = await mount3d({ onCameraMoved, onMoved })

    press('ArrowRight')
    fireEvent.pointerDown(mounted.canvas, { ...at(0, 0), button: 1, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(mounted.canvas, { ...at(2, 1), button: 1, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(mounted.canvas, { ...at(2, 1), button: 1, pointerId: 1, pointerType: 'mouse' })
    await tick()

    expect(round(perspectiveOf(game.camera).position.toArray())).not.toEqual([0, 4, 12])
    expect(perspectiveOf(game.cameraRig.sceneCamera).position.toArray()).toEqual([0, 4, 12])
    expect(SCENE_3D).toEqual(before)
    expect(onCameraMoved).not.toHaveBeenCalled()
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('re-places the scene camera, not the editor camera, when the camera block is edited', async () => {
    const { mounted, game } = await mount3d()
    const editor = game.camera
    mounted.rerender({ scene: { ...SCENE_3D, camera: { kind: 'perspective', position: [3, 2, 1], target: [0, 1, 0], fov: 30 } } })
    await tick()

    expect(perspectiveOf(game.cameraRig.sceneCamera).position.toArray()).toEqual([3, 2, 1])
    expect(game.camera).toBe(editor)
    expect(round(perspectiveOf(editor).position.toArray())).toEqual([0, 4, 12])
  })

})

describe('scene swaps under the editor camera (issue #173 CA-9)', () => {
  it('opens a 3D scene over a 2D one and back: orthographic in 2D, the editor camera in 3D', async () => {
    const mounted = mountViewport({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json', project: 'game' })
    await tick()
    const game = liveGame(mounted)
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
    mounted.rerender({ scene: SCENE_3D, scenePath: 'src/scenes/b.scene.json' })
    await tick()
    expect(liveGame(mounted)).toBe(game)
    expect(game.camera).not.toBe(game.cameraRig.sceneCamera)
    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual([0, 4, 12])
    mounted.rerender({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json' })
    await tick()
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
  })
})

describe('keyboard navigation on the focused viewport (issue #173 CA-11)', () => {
  it('is focusable', async () => {
    await mount3d()
    expect(surface().tabIndex).toBe(0)
  })

  it('orbits 5° per arrow, pans 0.5 u per Shift+arrow and zooms ×1.1 per + and -', async () => {
    const { game } = await mount3d()
    const camera = perspectiveOf(game.camera)
    const distance = Math.hypot(4, 12)

    press('ArrowRight')
    expect(THREE.MathUtils.radToDeg(Math.atan2(camera.position.x, camera.position.z))).toBeCloseTo(5, 6)
    press('ArrowLeft')
    expect(round(camera.position.toArray())).toEqual([0, 4, 12])
    press('ArrowRight', { shiftKey: true })
    expect(round(camera.position.toArray())).toEqual([0.5, 4, 12])
    press('ArrowLeft', { shiftKey: true })
    press('+')
    expect(camera.position.length()).toBeCloseTo(distance / 1.1, 6)
    press('-')
    press('-')
    expect(camera.position.length()).toBeCloseTo(distance * 1.1, 6)
  })

  it('ignores the keys while the viewport does not have focus', async () => {
    const { game } = await mount3d()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual([0, 4, 12])
  })
})

describe('the remembered pose (issue #173 CA-12)', () => {
  it('stores the pose per scene and restores it when the scene opens again', async () => {
    const first = await mount3d()
    press('ArrowRight', { shiftKey: true })
    expect(loadCameraPose('game', SCENE_PATH)).toEqual({ position: [0.5, 4, 12], target: [0.5, 0, 0] })
    first.mounted.rerender({ mode: 'play' })
    await tick()
    first.mounted.rerender({ mode: 'edit' })
    await tick()
    expect(round(perspectiveOf(liveGame(first.mounted).camera).position.toArray())).toEqual([0.5, 4, 12])
    removeViewportHost()
    installViewportHost()

    saveCameraPose('game', SCENE_PATH, { position: [7, 7, 7], target: [1, 0, 1] })
    const { game } = await mount3d()

    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual([7, 7, 7])
  })

  it("starts at the scene camera's pose when storage throws", async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const { game } = await mount3d()
    press('ArrowRight')
    expect(round(perspectiveOf(game.camera).position.toArray())).not.toEqual([0, 4, 12])
  })

  it("goes back to the scene camera's pose on 🎥", async () => {
    const { game } = await mount3d()
    press('ArrowRight', { shiftKey: true })
    fireEvent.click(screen.getByTitle("Go to the scene camera's pose"))
    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual([0, 4, 12])
    expect(loadCameraPose('game', SCENE_PATH)).toEqual({ position: [0, 4, 12], target: [0, 0, 0] })
  })
})

describe('framing the selection with F (issue #173 CA-15)', () => {
  it('aims at the selection and backs off to fit it', async () => {
    const { game } = await mount3d({ selected: 'Foe' })
    const camera = perspectiveOf(game.camera)
    fireEvent.keyDown(document.body, { key: 'f' })

    // Foe has no mesh: its bounds are a unit cube around (4, 0, -2), sphere radius √0.75, distance √0.75 / sin 25°.
    expect(targetOf(camera, Math.sqrt(0.75) / Math.sin(THREE.MathUtils.degToRad(25)))).toEqual([4, 0, -2])
  })

  it('does nothing with no selection, or with focus in a text field', async () => {
    const { game } = await mount3d()
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual([0, 4, 12])
    const { game: selected } = await mount3d({ selected: 'Foe' })
    const input = document.body.appendChild(document.createElement('input'))
    fireEvent.keyDown(input, { key: 'f' })
    expect(round(perspectiveOf(selected.camera).position.toArray())).toEqual([0, 4, 12])
  })

  it('frames from the toolbar too', async () => {
    const { game } = await mount3d({ selected: 'Foe' })
    fireEvent.click(screen.getByTitle('Frame selection (F)'))
    expect(targetOf(perspectiveOf(game.camera), Math.sqrt(0.75) / Math.sin(THREE.MathUtils.degToRad(25)))).toEqual([4, 0, -2])
  })
})

describe('the viewport tools over a 3D scene (issue #173 CA-16, CA-17)', () => {
  it('shows the grid toggle and size, the helpers toggle and the navigation buttons, not the 2D snap button', async () => {
    await mount3d()
    expect(screen.getByTitle('Show grid')).toBeDefined()
    expect(screen.getByTitle('Grid cell size (world units)')).toBeDefined()
    expect(screen.getByTitle('Show helpers')).toBeDefined()
    expect(screen.queryByTitle('Snap to grid (hold Shift to invert)')).toBeNull()
    expect(screen.getByTitle('Zoom in')).toBeDefined()
    expect(screen.getByTitle('Zoom out')).toBeDefined()
  })

  it('shows the 2D tools on a 2D scene, as before', async () => {
    mountViewport({ scene: HERO_AND_FOE, showCamera: true, onGridChange: () => {} })
    await tick()
    expect(screen.getByTitle('Snap to grid (hold Shift to invert)')).toBeDefined()
    expect(screen.getByTitle("Go to the scene camera's framing")).toBeDefined()
    expect(screen.queryByTitle('Show helpers')).toBeNull()
    expect(screen.queryByTitle('Frame selection (F)')).toBeNull()
  })

  it('zooms the editor camera from the toolbar', async () => {
    const { game } = await mount3d()
    fireEvent.click(screen.getByTitle('Zoom in'))
    expect(perspectiveOf(game.camera).position.length()).toBeCloseTo(Math.hypot(4, 12) / 1.25, 6)
  })
})

describe('what layer 3 leaves as it was (issue #173)', () => {
  it('still ignores a prefab drop on a 3D scene', async () => {
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

})

describe('what layer 3 leaves as it was: cameras (issue #173)', () => {
  it('does not re-place the scene camera for an edit that leaves the camera block alone', async () => {
    const { mounted, game } = await mount3d()
    perspectiveOf(game.cameraRig.sceneCamera).position.x = 9
    mounted.rerender({ scene: { ...SCENE_3D, entities: [...SCENE_3D.entities, { name: 'Extra', position: [1, 1, 1] }] } })
    await tick()
    expect(perspectiveOf(game.cameraRig.sceneCamera).position.x).toBe(9)
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

  it('frameEditView leaves the 2D edit camera alone over a 3D scene: the perspective pose is not an EditCamera', async () => {
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
