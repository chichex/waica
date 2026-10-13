// @vitest-environment happy-dom
import { act, createEvent, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { Model, THREE, type Game, type SceneJson, type SceneRegistry } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { installViewportHost, liveGame, mountViewport, removeViewportHost, type MountedViewport } from './test-viewport'

const REGISTRY_3D: SceneRegistry = { components: { Model } }

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 6, 12], target: [0, 0, 0], fov: 50 },
  entities: [
    { name: 'Knight', position: [-1, 0, 0], rotation: [0, 10, 0], components: [{ type: 'Model', props: { shape: 'box', size: 1 } }] },
    { name: 'Crate', position: [3, 0, 0], scale: [2, 1, 1], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] },
  ],
}

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

async function mount(overrides: Parameters<typeof mountViewport>[0] = {}) {
  const onTransformed = vi.fn()
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY_3D, showCamera: true, onGridChange: () => {}, selected: 'Knight', onTransformed, ...overrides })
  await tick()
  return { mounted, game: liveGame(mounted), onTransformed }
}

/** The live TransformControls of the edit view. */
function gizmoOf(game: Game): TransformControls {
  const helper = game.scene.children.find((child) => child.name === 'waica:editor-gizmo')
  const controls: unknown = helper && 'controls' in helper ? helper.controls : undefined
  if (!(controls instanceof TransformControls)) throw new Error('expected the TransformControls helper in the scene')
  return controls
}

/** One gizmo drag: grabbed, the attached pivot moved by `move`, released (the events TransformControls fires). */
function drag(controls: TransformControls, move: (pivot: THREE.Object3D) => void): void {
  const pivot = defined(controls.object, 'the attached pivot')
  act(() => {
    controls.dragging = true
    move(pivot)
    pivot.updateMatrixWorld()
    controls.dispatchEvent({ type: 'objectChange' })
    controls.dragging = false
  })
}

const pressed = (title: string): string | null => screen.getByTitle(title).getAttribute('aria-pressed')

describe('the gizmo and its modes (issue #173 CA-18)', () => {
  it('attaches TransformControls to the selection, translating in world space by default', async () => {
    const { game } = await mount()
    const controls = gizmoOf(game)
    expect(controls.object?.position.toArray()).toEqual([-1, 0, 0])
    expect(controls.mode).toBe('translate')
    expect(controls.space).toBe('world')
    expect(pressed('Move (W)')).toBe('true')
    expect(pressed('Rotate (E)')).toBe('false')
  })

  it('switches mode with W, E and R and with the buttons, and the space with World/Local', async () => {
    const { game } = await mount()
    const controls = gizmoOf(game)
    fireEvent.keyDown(document.body, { key: 'e' })
    await tick()
    expect(controls.mode).toBe('rotate')
    expect(pressed('Rotate (E)')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'r' })
    await tick()
    expect(controls.mode).toBe('scale')
    fireEvent.click(screen.getByTitle('Move (W)'))
    await tick()
    expect(controls.mode).toBe('translate')
    fireEvent.click(screen.getByTitle('Transform space: world (click for local)'))
    await tick()
    expect(controls.space).toBe('local')
    expect(screen.getByTitle('Transform space: local (click for world)')).toBeDefined()
  })

  it('ignores W, E and R while focus is in an input, a textarea or a select', async () => {
    const { game } = await mount()
    for (const tag of ['input', 'textarea', 'select']) {
      const field = document.body.appendChild(document.createElement(tag))
      fireEvent.keyDown(field, { key: 'e' })
      field.remove()
    }
    await tick()
    expect(gizmoOf(game).mode).toBe('translate')
  })

})

describe('the gizmo against the selection and the orbit controls (issue #173 CA-18)', () => {
  it('detaches with no selection', async () => {
    const { mounted, game } = await mount()
    mounted.rerender({ selected: null })
    await tick()
    expect(gizmoOf(game).object).toBeUndefined()
  })

  it('turns the orbit controls off while dragging', async () => {
    const { mounted, game } = await mount()
    const controls = gizmoOf(game)
    const orbitEnabled: boolean[] = []
    act(() => {
      controls.dragging = true
    })
    orbitEnabled.push(orbits(mounted))
    act(() => {
      controls.dragging = false
    })
    orbitEnabled.push(orbits(mounted))
    expect(orbitEnabled).toEqual([false, true])
  })
})

/** Whether a middle drag on the canvas moves the editor camera (OrbitControls enabled), the camera put back after. */
function orbits(mounted: MountedViewport): boolean {
  const camera = liveGame(mounted).camera
  const before = camera.position.clone()
  const at = (clientX: number) => ({ clientX, clientY: 300, pointerId: 7, pointerType: 'mouse', button: 1, bubbles: true })
  mounted.canvas.dispatchEvent(new PointerEvent('pointerdown', at(400)))
  mounted.canvas.dispatchEvent(new PointerEvent('pointermove', at(460)))
  mounted.canvas.dispatchEvent(new PointerEvent('pointerup', at(460)))
  const moved = !camera.position.equals(before)
  camera.position.copy(before)
  return moved
}

describe('a drag commits once (issue #173 CA-19)', () => {
  it("commits the dragged entity's transform on release, rounded to 0.001", async () => {
    const { game, onTransformed } = await mount()
    drag(gizmoOf(game), (pivot) => pivot.position.set(-1.23456, 0.5, 2.0004))
    expect(onTransformed).toHaveBeenCalledTimes(1)
    expect(onTransformed).toHaveBeenCalledWith([{ name: 'Knight', transform: { position: [-1.235, 0.5, 2], rotation: [0, 10, 0], scale: [1, 1, 1] } }])
    expect(defined(game.find('Knight')).position.toArray()).toEqual([-1.235, 0.5, 2])
  })

  it('commits a rotation in Euler degrees XYZ', async () => {
    const { game, onTransformed } = await mount()
    drag(gizmoOf(game), (pivot) => pivot.rotation.set(0, THREE.MathUtils.degToRad(55), 0))
    expect(onTransformed).toHaveBeenCalledWith([{ name: 'Knight', transform: { position: [-1, 0, 0], rotation: [0, 55, 0], scale: [1, 1, 1] } }])
  })
})

describe('snapping while Ctrl is held (issue #173 CA-20)', () => {
  /** A pointer event on the canvas, with or without Ctrl. */
  const press = (mounted: MountedViewport, ctrlKey: boolean): void => {
    fireEvent.pointerMove(mounted.canvas, { clientX: 10, clientY: 10, pointerId: 3, pointerType: 'mouse', ctrlKey })
  }

  it('snaps to the position, rotation and scale steps only while Ctrl is held', async () => {
    const { mounted, game } = await mount()
    const controls = gizmoOf(game)
    press(mounted, true)
    expect([controls.translationSnap, controls.rotationSnap, controls.scaleSnap]).toEqual([0.5, THREE.MathUtils.degToRad(15), 0.1])
    press(mounted, false)
    expect([controls.translationSnap, controls.rotationSnap, controls.scaleSnap]).toEqual([null, null, null])
  })

  it('takes the steps from three labelled fields, kept per user, refusing a value of 0 or less', async () => {
    const { mounted, game } = await mount()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Position snap step' }), { target: { value: '0.25' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rotation snap step (degrees)' }), { target: { value: '45' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scale snap step' }), { target: { value: '0' } })
    await tick()
    press(mounted, true)
    const controls = gizmoOf(game)
    expect([controls.translationSnap, controls.rotationSnap, controls.scaleSnap]).toEqual([0.25, THREE.MathUtils.degToRad(45), 0.1])
    expect(JSON.parse(storage.get('waica:editor:view') ?? '{}')).toMatchObject({ snap: { position: 0.25, rotation: 45, scale: 0.1 } })
  })
})

describe('a group transform (issue #173 CA-21)', () => {
  it('centers the gizmo on the selected positions and moves all of them by the delta, in one commit', async () => {
    const { game, onTransformed } = await mount({ selected: 'Knight', multiSelected: ['Knight', 'Crate'] })
    const controls = gizmoOf(game)
    expect(controls.object?.position.toArray()).toEqual([1, 0, 0])
    drag(controls, (pivot) => pivot.position.set(1, 2, 0))
    expect(onTransformed).toHaveBeenCalledTimes(1)
    expect(onTransformed).toHaveBeenCalledWith([
      { name: 'Knight', transform: { position: [-1, 2, 0], rotation: [0, 10, 0], scale: [1, 1, 1] } },
      { name: 'Crate', transform: { position: [3, 2, 0], rotation: [0, 0, 0], scale: [2, 1, 1] } },
    ])
  })
})

describe('a prefab dropped on a 3D viewport (issue #173 CA-22)', () => {
  const dataTransfer = { getData: (type: string) => (type === 'waica/prefab' ? 'objects/crate' : ''), dropEffect: 'none' }

  /** Drops the crate prefab at a client point (happy-dom's DragEvent leaves clientX/clientY out of its init: they are set on the event). */
  const dropAtClient = (mounted: MountedViewport, clientX: number, clientY: number): void => {
    fireEvent.dragOver(mounted.canvas, { dataTransfer })
    const event = createEvent.drop(mounted.canvas, { dataTransfer })
    Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } })
    fireEvent(mounted.canvas, event)
  }

  /** Drops the crate prefab where the world point is drawn. */
  const dropAt = (mounted: MountedViewport, point: { x: number; y: number; z: number }): void => {
    const at = defined(liveGame(mounted).worldToScreen(point), 'a visible point')
    dropAtClient(mounted, at.x, at.y)
  }

  it("places it on a Model's surface, else on the y=0 plane", async () => {
    const onDropPrefab = vi.fn()
    const { mounted } = await mount({ onDropPrefab })
    dropAt(mounted, { x: 3, y: 1, z: 0.5 })
    expect(onDropPrefab).toHaveBeenLastCalledWith('objects/crate', [3, 1, 0.5])
    dropAt(mounted, { x: -4, y: 0, z: 2 })
    expect(onDropPrefab).toHaveBeenLastCalledWith('objects/crate', [-4, 0, 2])
  })

  it('drops nothing where the ray meets neither', async () => {
    const onDropPrefab = vi.fn()
    // A level camera: the upper half of the view looks at the sky, above the y=0 plane.
    const level: SceneJson = { ...SCENE, camera: { kind: 'perspective', position: [0, 1, 12], target: [0, 1, 0], fov: 50 } }
    const { mounted } = await mount({ scene: level, onDropPrefab })
    dropAtClient(mounted, 400, 2)
    expect(onDropPrefab).not.toHaveBeenCalled()
  })
})
