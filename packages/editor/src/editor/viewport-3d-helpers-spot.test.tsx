// @vitest-environment happy-dom
import { act, fireEvent, screen } from '@testing-library/react'
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
import { GRID, installViewportHost, liveGame, mountViewport, removeViewportHost } from './test-viewport'

const CONE = 'waica:editor-spot-cone'
const REGISTRY_3D: SceneRegistry = { components: { Model, PointLight, SpotLight } }

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 6, 12], target: [0, 0, 0], fov: 50, near: 0.5, far: 80 },
  entities: [
    { name: 'Spot', position: [1, 4, -2], components: [{ type: 'SpotLight', props: { distance: 6, angle: 30, offsetX: 0.5, offsetY: 1, direction: [0, 0, -1] } }] },
    { name: 'Open', position: [4, 1, 0], components: [{ type: 'SpotLight', props: { distance: 0 } }] },
    { name: 'Lamp', position: [-4, 3, 0], components: [{ type: 'PointLight', props: { distance: 6 } }] },
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
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY_3D, showCamera: true, grid: GRID, onGridChange: () => {}, ...overrides })
  await tick()
  return { mounted, game: liveGame(mounted) }
}

/** The visible objects of the scene with `name`. */
function shown(game: Game, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = []
  game.scene.traverseVisible((object) => {
    if (object.name === name) found.push(object)
  })
  return found
}

/** Every object of the scene with `name`, visible or not. */
function overlaysOf(game: Game, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = []
  game.scene.traverse((object) => {
    if (object.name === name) found.push(object)
  })
  return found
}

const spotOf = (game: Game, name: string): SpotLight => defined(defined(game.find(name)).get(SpotLight))

type ConeLines = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>

function coneOf(game: Game): ConeLines {
  return defined(shown(game, CONE).find((candidate): candidate is ConeLines =>
    candidate instanceof THREE.LineSegments && candidate.geometry instanceof THREE.BufferGeometry && candidate.material instanceof THREE.LineBasicMaterial,
  ), 'the spot cone lines')
}

/** The cone's vertices in world space. */
function worldVertices(cone: ConeLines): THREE.Vector3[] {
  cone.updateWorldMatrix(true, false)
  const positions = cone.geometry.getAttribute('position')
  return Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(cone.matrixWorld))
}

/** Asserts a wire cone: apex, axis, length along it and base radius, with every vertex on the cone surface. */
function expectCone(cone: ConeLines, expected: { apex: THREE.Vector3; axis: THREE.Vector3; length: number; radius: number }): void {
  const { apex, axis, length, radius } = expected
  const vertices = worldVertices(cone)
  expect(Math.min(...vertices.map((vertex) => vertex.distanceTo(apex)))).toBeCloseTo(0, 4)
  const depths = vertices.map((vertex) => vertex.clone().sub(apex).dot(axis))
  expect(Math.min(...depths)).toBeGreaterThanOrEqual(-1e-4)
  expect(Math.max(...depths)).toBeCloseTo(length, 4)
  vertices.forEach((vertex, index) => {
    const depth = defined(depths[index])
    const across = vertex.clone().sub(apex).addScaledVector(axis, -depth).length()
    expect(across).toBeCloseTo((depth / length) * radius, 4)
  })
  const rim = vertices.filter((_, index) => Math.abs(defined(depths[index]) - length) < 1e-4)
  expect(rim.length).toBeGreaterThan(8)
}

it('draws a wire cone from the light, along its direction, as long as distance and as wide as distance times tan(angle) (CA-12)', async () => {
  const { game } = await mount()
  expect(shown(game, CONE)).toHaveLength(1)

  expectCone(coneOf(game), {
    apex: new THREE.Vector3(1.5, 5, -2),
    axis: new THREE.Vector3(0, 0, -1),
    length: 6,
    radius: 6 * Math.tan(Math.PI / 6),
  })
})

it('follows the entity transform: a rotated, scaled and moved spot keeps its cone on the world light and direction (CA-12)', async () => {
  const { game } = await mount()
  const entity = defined(game.find('Spot'))
  entity.node.position.set(-3, 2, 5)
  entity.node.rotation.y = Math.PI / 2
  entity.node.scale.setScalar(2)
  await tick()

  // Doubling the entity takes the offset (0.5, 1, 0) to (1, 2, 0); turning 90° about Y sends that to (0, 2, -1)
  // and the direction (0, 0, -1) to (-1, 0, 0). The reach stays `distance` world units.
  expectCone(coneOf(game), {
    apex: new THREE.Vector3(-3, 4, 4),
    axis: new THREE.Vector3(-1, 0, 0),
    length: 6,
    radius: 6 * Math.tan(Math.PI / 6),
  })
})

it('rebuilds the cone when angle or distance change, freeing the old geometry (CA-12)', async () => {
  const { game } = await mount()
  const spot = spotOf(game, 'Spot')
  const disposed = vi.fn()
  coneOf(game).geometry.addEventListener('dispose', disposed)

  spot.angle = 45
  spot.distance = 8
  await tick()

  expect(disposed).toHaveBeenCalledTimes(1)
  expectCone(coneOf(game), { apex: new THREE.Vector3(1.5, 5, -2), axis: new THREE.Vector3(0, 0, -1), length: 8, radius: 8 })
  await tick()
  expect(disposed).toHaveBeenCalledTimes(1)
})

it('draws no cone for an unlimited spot, and draws it once it has a distance (CA-12)', async () => {
  const { game } = await mount()
  expect(shown(game, CONE)).toHaveLength(1)
  expect(overlaysOf(game, CONE)).toHaveLength(2)
  const open = spotOf(game, 'Open')

  open.distance = 3
  await tick()
  expect(shown(game, CONE)).toHaveLength(2)

  open.distance = 0
  await tick()
  expect(shown(game, CONE)).toHaveLength(1)
})

it('draws the cone with the same color, opacity and material class as the PointLight range sphere (CA-12)', async () => {
  const { game } = await mount()
  const range = defined(shown(game, 'waica:editor-light-range')[0])
  if (!(range instanceof THREE.LineSegments) || !(range.material instanceof THREE.LineBasicMaterial)) throw new Error('expected the range lines')
  const { material } = coneOf(game)

  expect(material.color.getHex()).toBe(0xffc857)
  expect([material.color.getHex(), material.opacity, material.transparent]).toEqual([range.material.color.getHex(), range.material.opacity, range.material.transparent])
})

it('removes the cone and frees its resources with its entity (CA-12)', async () => {
  const { game } = await mount()
  const cone = coneOf(game)
  const geometryDisposed = vi.fn()
  const materialDisposed = vi.fn()
  cone.geometry.addEventListener('dispose', geometryDisposed)
  cone.material.addEventListener('dispose', materialDisposed)

  defined(game.find('Spot')).destroy()
  await tick()

  expect(overlaysOf(game, CONE)).toHaveLength(1)
  expect(cone.parent).toBeNull()
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  expect(materialDisposed).toHaveBeenCalledTimes(1)
})

it('hides the cone behind 👁, draws none in Play and leaves the scene JSON untouched (CA-12)', async () => {
  const scene = structuredClone(SCENE)
  const before = JSON.stringify(scene)
  const { game } = await mount({ scene })
  expect(shown(game, CONE)).toHaveLength(1)

  fireEvent.click(screen.getByTitle('Show helpers'))
  await tick()
  expect(shown(game, CONE)).toHaveLength(0)
  fireEvent.click(screen.getByTitle('Show helpers'))
  await tick()
  expect(shown(game, CONE)).toHaveLength(1)

  const play = await mount({ mode: 'play' })
  expect(overlaysOf(play.game, CONE)).toHaveLength(0)
  expect(JSON.stringify(scene)).toBe(before)
})
