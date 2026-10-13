// @vitest-environment happy-dom
import { act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { Model, PointLight, Sun, THREE, type Game, type SceneJson, type SceneRegistry } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { installViewportHost, liveGame, mountViewport, removeViewportHost, type MountedViewport } from './test-viewport'

const REGISTRY_3D: SceneRegistry = { components: { Model, Sun, PointLight } }

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 6, 12], target: [0, 0, 0], fov: 50 },
  entities: [
    { name: 'Crate', position: [-3, 1, 0], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] },
    { name: 'Barrel', position: [3, 1, 0], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] },
    { name: 'Lamp', position: [0, 3, -4], components: [{ type: 'PointLight', props: { distance: 6 } }] },
    { name: 'Daylight', position: [5, 4, -6], components: [{ type: 'Sun' }] },
    { name: 'Marker', position: [-6, 0, 4] },
  ],
}

beforeEach(installViewportHost)
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

const callbacks = () => ({ onSelect: vi.fn(), onToggleSelect: vi.fn(), onSelectCamera: vi.fn() })

async function mount(overrides: Parameters<typeof mountViewport>[0] = {}) {
  const spies = callbacks()
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY_3D, showCamera: true, ...spies, ...overrides })
  await tick()
  return { mounted, game: liveGame(mounted), ...spies }
}

/** A left click (or another button) on the mounted viewport where the world point is drawn through the editor camera. */
function clickWorld(mounted: MountedViewport, point: { x: number; y: number; z: number }, init: { shiftKey?: boolean; altKey?: boolean; button?: number } = {}): void {
  const at = defined(liveGame(mounted).worldToScreen(point), 'a visible point')
  const event = { clientX: at.x, clientY: at.y, pointerId: 1, pointerType: 'mouse', button: 0, ...init }
  fireEvent.pointerDown(mounted.canvas, event)
  fireEvent.pointerUp(mounted.canvas, event)
}

/** Every object of the scene with `name`, in scene order. */
function overlaysNamed(game: Game, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = []
  game.scene.traverse((object) => {
    if (object.name === name) found.push(object)
  })
  return found
}

describe('picking in 3D edit mode (issue #173 CA-13)', () => {
  it('selects the entity whose Model a left click hits, through the editor camera', async () => {
    const { mounted, onSelect } = await mount()
    clickWorld(mounted, { x: -3, y: 1, z: 1 })
    expect(onSelect).toHaveBeenLastCalledWith('Crate')
    clickWorld(mounted, { x: 3, y: 1, z: 1 })
    expect(onSelect).toHaveBeenLastCalledWith('Barrel')
  })

  it('toggles the entity in the multi-selection on Shift+click', async () => {
    const { mounted, onSelect, onToggleSelect } = await mount({ selected: 'Crate' })
    clickWorld(mounted, { x: 3, y: 1, z: 1 }, { shiftKey: true })
    expect(onToggleSelect).toHaveBeenCalledWith('Barrel')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clears the selection on a click on empty space', async () => {
    const { mounted, onSelect } = await mount({ selected: 'Crate' })
    clickWorld(mounted, { x: 0, y: 0, z: 4 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('leaves the selection alone on a touch press: a finger orbits (PR #176 finding 2)', async () => {
    const { mounted, onSelect, onToggleSelect } = await mount({ selected: 'Crate' })
    const event = { clientX: 4, clientY: 4, pointerId: 2, pointerType: 'touch', button: 0 }
    fireEvent.pointerDown(mounted.canvas, event)
    fireEvent.pointerUp(mounted.canvas, event)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('picks nothing on an Alt+left, middle or right press: they navigate', async () => {
    const { mounted, onSelect, onToggleSelect } = await mount()
    clickWorld(mounted, { x: -3, y: 1, z: 1 }, { altKey: true })
    clickWorld(mounted, { x: -3, y: 1, z: 1 }, { button: 1 })
    clickWorld(mounted, { x: -3, y: 1, z: 1 }, { button: 2 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleSelect).not.toHaveBeenCalled()
  })
})

describe('selection boxes (issue #173 CA-13)', () => {
  it("outlines each selected entity's world bounds in the 2D selection color, following it every frame", async () => {
    const { mounted, game } = await mount({ selected: 'Crate' })
    const [box] = overlaysNamed(game, 'waica:editor-selection').filter((object) => object.visible)
    if (!(box instanceof THREE.Box3Helper)) throw new Error('expected a Box3Helper')
    expect(box.box.min.toArray()).toEqual([-4, 0, -1])
    expect(box.box.max.toArray()).toEqual([-2, 2, 1])
    const material: unknown = box.material
    if (!(material instanceof THREE.LineBasicMaterial)) throw new Error('expected a line material')
    expect(material.color.getHex()).toBe(0xffb703)

    mounted.handle().applyTransform('Crate', { position: [0, 1, 2] })
    await tick()
    expect(box.box.min.toArray()).toEqual([-1, 0, 1])

    mounted.rerender({ selected: 'Crate', multiSelected: ['Crate', 'Barrel'] })
    await tick()
    expect(overlaysNamed(game, 'waica:editor-selection').filter((object) => object.visible)).toHaveLength(2)
    mounted.rerender({ selected: null, multiSelected: [] })
    await tick()
    expect(overlaysNamed(game, 'waica:editor-selection').filter((object) => object.visible)).toHaveLength(0)
  })
})

describe('icons for meshless entities and the camera (issue #173 CA-14)', () => {
  it('draws a constant-size billboard for every Sun, PointLight, entity without a Model and the scene camera', async () => {
    const { game } = await mount()
    const icons = overlaysNamed(game, 'waica:editor-icon').filter((object): object is THREE.Sprite => object instanceof THREE.Sprite && object.visible)
    const at = icons.map((icon) => icon.position.toArray()).sort()
    expect(at).toEqual([[-6, 0, 4], [0, 3, -4], [0, 6, 12], [5, 4, -6]].sort())
    for (const icon of icons) expect(icon.material.sizeAttenuation).toBe(false)
  })

  it("selects an icon's entity on a click, and opens the camera inspector from the camera icon", async () => {
    const { mounted, onSelect, onSelectCamera } = await mount()
    clickWorld(mounted, { x: 0, y: 3, z: -4 })
    expect(onSelect).toHaveBeenLastCalledWith('Lamp')
    clickWorld(mounted, { x: 5, y: 4, z: -6 })
    expect(onSelect).toHaveBeenLastCalledWith('Daylight')
    clickWorld(mounted, { x: -6, y: 0, z: 4 })
    expect(onSelect).toHaveBeenLastCalledWith('Marker')

    // Orbit away from the scene camera so its icon is in view.
    defined(document.querySelector<HTMLElement>('.ed-viewport'), 'the viewport').focus()
    for (let step = 0; step < 4; step += 1) fireEvent.keyDown(defined(document.querySelector<HTMLElement>('.ed-viewport'), 'the viewport'), { key: '-' })
    await tick()
    clickWorld(mounted, { x: 0, y: 6, z: 12 })
    expect(onSelectCamera).toHaveBeenCalledTimes(1)
  })

  it('draws an icon for a Model with no mesh yet, so a broken one can still be clicked (PR #176 finding 3)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    const scene: SceneJson = { ...SCENE, entities: [...SCENE.entities, { name: 'Broken', position: [0, 0, 6], components: [{ type: 'Model', props: { src: 'missing.glb' } }] }] }
    const { mounted, game, onSelect } = await mount({ scene })
    const icons = overlaysNamed(game, 'waica:editor-icon').filter((object) => object.visible).map((icon) => icon.position.toArray())
    expect(icons).toContainEqual([0, 0, 6])
    clickWorld(mounted, { x: 0, y: 0, z: 6 })
    expect(onSelect).toHaveBeenLastCalledWith('Broken')
    vi.unstubAllGlobals()
  })

  it('draws no icon, box or helper in Play', async () => {
    const { game } = await mount({ mode: 'play', selected: 'Crate' })
    for (const name of ['waica:editor-icon', 'waica:editor-selection']) {
      expect(overlaysNamed(game, name).filter((object) => object.visible)).toHaveLength(0)
    }
  })
})
