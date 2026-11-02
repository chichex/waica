// @vitest-environment happy-dom
import { act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { Model, PointLight, SpotLight, THREE, type Game, type SceneJson, type SceneRegistry } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { installViewportHost, liveGame, mountViewport, removeViewportHost, type MountedViewport } from './test-viewport'

const REGISTRY_3D: SceneRegistry = { components: { Model, PointLight, SpotLight } }

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 6, 12], target: [0, 0, 0], fov: 50 },
  entities: [
    { name: 'Crate', position: [-3, 1, 0], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] },
    { name: 'Lamp', position: [0, 3, -4], components: [{ type: 'PointLight', props: { distance: 6 } }] },
    { name: 'Beam', position: [5, 4, -6], components: [{ type: 'SpotLight', props: { distance: 6, offsetY: 0.5 } }] },
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

async function mount() {
  const onSelect = vi.fn()
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY_3D, showCamera: true, onSelect, onToggleSelect: vi.fn(), onSelectCamera: vi.fn() })
  await tick()
  return { mounted, game: liveGame(mounted), onSelect }
}

/** A left click where the world point is drawn through the editor camera. */
function clickWorld(mounted: MountedViewport, point: { x: number; y: number; z: number }): void {
  const at = defined(liveGame(mounted).worldToScreen(point), 'a visible point')
  const event = { clientX: at.x, clientY: at.y, pointerId: 1, pointerType: 'mouse', button: 0 }
  fireEvent.pointerDown(mounted.canvas, event)
  fireEvent.pointerUp(mounted.canvas, event)
}

/** The drawn icon sprites, by the position of the entity they stand for. */
function visibleIcons(game: Game): THREE.Sprite[] {
  const found: THREE.Object3D[] = []
  game.scene.traverseVisible((object) => {
    if (object.name === 'waica:editor-icon') found.push(object)
  })
  return found.filter((object): object is THREE.Sprite => object instanceof THREE.Sprite)
}

const iconAt = (game: Game, name: string): THREE.Sprite => {
  const position = defined(game.find(name)).node.getWorldPosition(new THREE.Vector3())
  return defined(visibleIcons(game).find((icon) => icon.position.distanceTo(position) < 1e-6), `the icon of ${name}`)
}

it('gives a SpotLight with no Model its own icon, drawn like the PointLight one (CA-13)', async () => {
  const { game } = await mount()
  const [beam, lamp, marker] = ['Beam', 'Lamp', 'Marker'].map((name) => iconAt(game, name))

  expect(defined(beam).material).not.toBe(defined(lamp).material)
  expect(defined(beam).material).not.toBe(defined(marker).material)
  expect(defined(beam).scale.toArray()).toEqual(defined(lamp).scale.toArray())
  expect([beam, lamp].map((icon) => [defined(icon).material.sizeAttenuation, defined(icon).material.depthTest, defined(icon).material.transparent]))
    .toEqual([[false, false, true], [false, false, true]])
  expect(defined(beam).material.color.getHex()).toBe(defined(lamp).material.color.getHex())
})

it('draws one icon per meshless entity: the spot target under its node adds none (CA-13)', async () => {
  const { game } = await mount()
  const spot = defined(defined(game.find('Beam')).get(SpotLight))
  expect(spot.light?.target.parent).toBe(defined(game.find('Beam')).node)

  // Lamp, Beam, Marker and the scene camera; the Crate has a mesh and the spot's target is no icon.
  expect(visibleIcons(game)).toHaveLength(4)
  expect(visibleIcons(game).map((icon) => icon.position.toArray()).sort()).toEqual([[-6, 0, 4], [0, 3, -4], [0, 6, 12], [5, 4, -6]].sort())
})

it('selects the spot entity on a click on its icon, and not on the empty space of its target (CA-13)', async () => {
  const { mounted, onSelect } = await mount()

  clickWorld(mounted, { x: 5, y: 4, z: -6 })
  expect(onSelect).toHaveBeenLastCalledWith('Beam')

  // The target hangs one unit below the light at (5, 4.5, -6): not a pick target.
  clickWorld(mounted, { x: 5, y: 3.5, z: -6 })
  expect(onSelect).toHaveBeenLastCalledWith(null)
})
