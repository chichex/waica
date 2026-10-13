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

import { Collider, Model, PointLight, Sun, THREE, type Game, type SceneJson, type SceneRegistry } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { GRID, installViewportHost, liveGame, mountViewport, removeViewportHost } from './test-viewport'

const REGISTRY_3D: SceneRegistry = { components: { Model, Sun, PointLight, Collider } }

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 6, 12], target: [0, 0, 0], fov: 50, near: 0.5, far: 80 },
  entities: [
    { name: 'Daylight', position: [2, 5, 1], components: [{ type: 'Sun', props: { direction: [0, -3, 4] } }] },
    { name: 'Lamp', position: [0, 3, -4], components: [{ type: 'PointLight', props: { distance: 6, offsetY: 1 } }] },
    { name: 'Glow', position: [4, 1, 0], components: [{ type: 'PointLight', props: { distance: 0 } }] },
    { name: 'Wall', position: [-3, 1, 0], components: [{ type: 'Collider', props: { shape: 'box', size: [2, 3, 0.5], offset: [0, 0.5, 0] } }] },
    { name: 'Ball', position: [0, 1, 3], components: [{ type: 'Collider', props: { shape: 'sphere', radius: 0.75, sensor: true } }] },
    { name: 'Pill', position: [3, 0, 3], components: [{ type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } }] },
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
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY_3D, showCamera: true, grid: { ...GRID, show: true, size: 0.5 }, onGridChange: () => {}, ...overrides })
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

const round = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1000) / 1000 + 0)

/** The grid object, with its vertex positions and colors as flat xyz / rgb lists. */
function gridOf(game: Game): { grid: THREE.Object3D; positions: number[]; colors: number[] } {
  const [grid] = shown(game, 'waica:editor-grid-3d')
  if (!(grid instanceof THREE.LineSegments)) throw new Error('expected the grid lines')
  const geometry: unknown = grid.geometry
  if (!(geometry instanceof THREE.BufferGeometry)) throw new Error('expected a BufferGeometry')
  const values = (name: 'position' | 'color'): number[] => {
    const attribute: unknown = geometry.getAttribute(name)
    if (!(attribute instanceof THREE.BufferAttribute)) throw new Error(`expected the ${name} attribute`)
    return Array.from(attribute.array, Number)
  }
  return { grid, positions: values('position'), colors: values('color') }
}

/** The color of the grid line along X at z = `at` (alongX), or along Z at x = `at`. */
function lineColor(game: Game, at: number, alongX: boolean): [number, number, number] {
  const { positions, colors } = gridOf(game)
  for (let vertex = 0; vertex < positions.length / 3; vertex += 2) {
    const [x0, , z0, x1, , z1] = positions.slice(vertex * 3, vertex * 3 + 6)
    // The coordinate the line holds and the one it runs along.
    const [held0, held1, run0, run1] = alongX ? [z0, z1, x0, x1] : [x0, x1, z0, z1]
    if (held0 !== at || held1 !== at || run0 === run1) continue
    const [r = 0, g = 0, b = 0] = colors.slice(vertex * 3, vertex * 3 + 3)
    return [r, g, b]
  }
  throw new Error('no such line')
}

describe('the 3D grid (issue #173 CA-16)', () => {
  it('draws an XZ grid at y=0 of 100 × 100 cells of the grid size', async () => {
    const { game } = await mount()
    const { grid, positions } = gridOf(game)
    // 101 lines along X and 101 along Z, two vertices each.
    expect(positions.length / 3).toBe(404)
    expect(grid.position.y).toBe(0)
    expect(grid.scale.toArray()).toEqual([0.5, 1, 0.5])
    const box = new THREE.Box3().setFromArray(positions)
    expect([box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z]).toEqual([-50, 50, 0, 0, -50, 50])
  })

  it('draws the X axis red, the Z axis blue and a major line every 10 cells', async () => {
    const { game } = await mount()
    const [xr, xg, xb] = lineColor(game, 0, true)
    const [zr, zg, zb] = lineColor(game, 0, false)
    expect(xr).toBeGreaterThan(xg + xb)
    expect(zb).toBeGreaterThan(zr + zg)
    const sum = (color: readonly number[]): number => color.reduce((a, b) => a + b)
    expect(sum(lineColor(game, 10, true))).toBeGreaterThan(sum(lineColor(game, 7, true)))
    expect(sum(lineColor(game, -20, false))).toBeGreaterThan(sum(lineColor(game, 13, false)))
  })

  it('follows the grid toggle and size, and is not drawn in Play', async () => {
    const { mounted, game } = await mount()
    mounted.rerender({ grid: { ...GRID, show: false, size: 0.5 } })
    await tick()
    expect(shown(game, 'waica:editor-grid-3d')).toHaveLength(0)
    mounted.rerender({ grid: { ...GRID, show: true, size: 2 } })
    await tick()
    expect(defined(shown(game, 'waica:editor-grid-3d')[0]).scale.toArray()).toEqual([2, 1, 2])
    // The icons are how a light or the camera is picked: 👁 leaves them (PR #176 finding 4).
    expect(shown(game, 'waica:editor-icon').length).toBeGreaterThan(0)

    const play = await mount({ mode: 'play' })
    expect(shown(play.game, 'waica:editor-grid-3d')).toHaveLength(0)
  })
})

describe('the helpers (issue #173 CA-17)', () => {
  it("draws the scene camera's frustum with its fov, near, far and the viewport's aspect", async () => {
    const { game } = await mount()
    const [frustum] = shown(game, 'waica:editor-frustum')
    if (!(frustum instanceof THREE.CameraHelper)) throw new Error('expected a CameraHelper')
    const lens = frustum.camera
    if (!(lens instanceof THREE.PerspectiveCamera)) throw new Error('expected a perspective lens')
    expect([lens.fov, lens.near, lens.far]).toEqual([50, 0.5, 80])
    expect(lens.aspect).toBeCloseTo(800 / 600)
    expect(round(lens.position.toArray())).toEqual([0, 6, 12])
  })

  it("uses the project's resolution for the frustum's aspect when it has one", async () => {
    const { game } = await mount({ resolution: { width: 640, height: 360 } })
    const [frustum] = shown(game, 'waica:editor-frustum')
    if (!(frustum instanceof THREE.CameraHelper) || !(frustum.camera instanceof THREE.PerspectiveCamera)) throw new Error('expected a perspective CameraHelper')
    expect(frustum.camera.aspect).toBeCloseTo(16 / 9)
  })

  it("points an arrow from each Sun's entity along its direction", async () => {
    const { game } = await mount()
    const [arrow] = shown(game, 'waica:editor-sun-direction')
    if (!(arrow instanceof THREE.ArrowHelper)) throw new Error('expected an ArrowHelper')
    expect(arrow.position.toArray()).toEqual([2, 5, 1])
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion)
    expect(round(along.toArray())).toEqual([0, -0.6, 0.8])
  })

})

describe('freeing what the helpers drew (PR #176 finding 5)', () => {
  it("disposes a collider's old wire when its shape changes, and every overlay with the edit view", async () => {
    const { game, mounted } = await mount()
    const before = overlaysOf(game, 'waica:editor-collider')
    const geometries = before.flatMap((holder) => holder.children).filter((child): child is THREE.LineSegments => child instanceof THREE.LineSegments).map((line) => line.geometry)
    const disposed = geometries.map(() => vi.fn())
    geometries.forEach((geometry, index) => geometry.addEventListener('dispose', defined(disposed[index], 'listener')))
    const collider = defined(game.find('Wall')?.components.find((component) => component instanceof Collider), 'collider')
    collider.size = [4, 4, 4]
    await tick()
    expect(disposed.filter((listener) => listener.mock.calls.length > 0)).toHaveLength(1)

    const kept = overlaysOf(game, 'waica:editor-grid-3d').map((grid) => (grid as THREE.LineSegments).geometry)
    const gone = kept.map(() => vi.fn())
    kept.forEach((geometry, index) => geometry.addEventListener('dispose', defined(gone[index], 'listener')))
    mounted.rerender({ mode: 'play' })
    await tick()
    expect(gone.every((listener) => listener.mock.calls.length === 1)).toBe(true)
    expect(overlaysOf(game, 'waica:editor-grid-3d')).toHaveLength(0)
  })
})

describe('the light, collider and toggle helpers (issue #173 CA-17)', () => {
  it("rings each PointLight's range at its distance, and draws none for an unlimited one", async () => {
    const { game } = await mount()
    const ranges = shown(game, 'waica:editor-light-range')
    expect(ranges).toHaveLength(1)
    expect(defined(ranges[0]).position.toArray()).toEqual([0, 4, -4])
    expect(defined(ranges[0]).scale.toArray()).toEqual([6, 6, 6])
  })

  it("wires each Collider's shape, sensors alike, at the entity with its offset", async () => {
    const { game } = await mount()
    const wires = shown(game, 'waica:editor-collider')
    expect(wires).toHaveLength(3)
    const boundsOf = (index: number): number[] => {
      const box = new THREE.Box3().setFromObject(defined(wires[index]))
      return round([...box.min.toArray(), ...box.max.toArray()])
    }
    const all = [0, 1, 2].map(boundsOf).sort()
    expect(all).toEqual(
      [
        [-4, 0, -0.25, -2, 3, 0.25],
        [-0.75, 0.25, 2.25, 0.75, 1.75, 3.75],
        [2.6, -0.9, 2.6, 3.4, 0.9, 3.4],
      ].sort(),
    )
  })

  it('hides every helper behind 👁, remembered per user, and draws none in Play', async () => {
    const { game } = await mount()
    fireEvent.click(screen.getByTitle('Show helpers'))
    await tick()
    for (const name of ['waica:editor-frustum', 'waica:editor-sun-direction', 'waica:editor-light-range', 'waica:editor-collider']) {
      expect(shown(game, name), name).toHaveLength(0)
    }
    expect(JSON.parse(storage.get('waica:editor:view') ?? '{}')).toMatchObject({ helpers: false })
    expect(screen.getByTitle('Show helpers').getAttribute('aria-pressed')).toBe('false')

    const play = await mount({ mode: 'play' })
    for (const name of ['waica:editor-frustum', 'waica:editor-sun-direction', 'waica:editor-light-range', 'waica:editor-collider', 'waica:editor-icon']) {
      expect(shown(play.game, name), name).toHaveLength(0)
    }
  })
})
