// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { SceneCameraJson } from './camera.js'
import { Model } from './components/model.js'
import type { Game, GameResolution } from './game.js'
import type { PointerPick } from './pointer.js'
import { loadScene, type SceneEntityJson } from './scene.js'
import { resetFakeRendering } from './test-renderer.js'
import { ready3dGame, registryOf, scene3d, type Game3d } from './test-game-3d.js'
import { defined } from './test-support.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetFakeRendering()
})

const CAMERA: SceneCameraJson = { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60 }

const box = (name: string, position: [number, number, number], size = 2): SceneEntityJson => ({
  name,
  position,
  components: [{ type: 'Model', props: { shape: 'box', size } }],
})

/** A Game whose camera sits at (0, 5, 10) looking at the origin, with the given entities. */
async function setup(entities: SceneEntityJson[], size?: { width: number; height: number }, resolution?: GameResolution): Promise<Game3d> {
  const built = await ready3dGame(size, resolution)
  loadScene(built.game, scene3d(entities, {}, CAMERA), registryOf({ Model }))
  return built
}

function canvasOf(): HTMLCanvasElement {
  return defined(document.querySelector('canvas'), 'the game canvas')
}

function clickAt(clientX: number, clientY: number): void {
  canvasOf().dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, button: 0 }))
}

/** A real pointerdown where a world point is drawn; the pending pick it queued. */
function pickAfterClick(game: Game, point: { x: number; y: number; z?: number }): PointerPick | null {
  const at = defined(game.worldToScreen(point), 'a visible point')
  clickAt(at.x, at.y)
  return game.pointer.takePending()
}

describe('raycast picking (CA-12)', () => {
  it('picks the entity under the click with the world-space hit point', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])

    const pick = defined(pickAfterClick(game, { x: 2, y: 0.5, z: 1 }), 'a pick')

    expect(pick.entity?.name).toBe('Crate')
    expect(pick.point.x).toBeCloseTo(2, 4)
    expect(pick.point.y).toBeCloseTo(0.5, 4)
    expect(pick.point.z).toBeCloseTo(1, 4)
  })

  it('resolves the nearest hit when several models lie along the ray', async () => {
    // From the camera at (0, 5, 10) the far crate sits exactly behind the near one.
    const along = (t: number): [number, number, number] => [0, 5 * (1 - t), 10 * (1 - t)]
    const [x, y, z] = along(0.2)
    const { game } = await setup([box('Far', along(0.9), 1), box('Near', [x, y, z], 1)])

    const pick = defined(pickAfterClick(game, { x, y, z }), 'a pick')

    expect(pick.entity?.name).toBe('Near')
  })

  it('falls back to the ground plane y=0 with no entity when nothing is hit', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])

    const pick = defined(pickAfterClick(game, { x: -4, y: 0, z: 2 }), 'a pick')

    expect(pick.entity).toBeNull()
    expect(pick.point.x).toBeCloseTo(-4, 4)
    expect(pick.point.y).toBeCloseTo(0, 4)
    expect(pick.point.z).toBeCloseTo(2, 4)
  })

  it('produces no pick for a ray that never meets the ground', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])
    clickAt(320, 2)
    expect(game.pointer.takePending()).toBeNull()
  })

  it('ignores a click on a letterbox bar', async () => {
    const { game } = await setup([], { width: 800, height: 300 }, { width: 640, height: 360 })
    // vw = 300 * 16/9 = 533.3, so the bars are the 133.3 px at each side.
    clickAt(50, 150)
    expect(game.pointer.takePending()).toBeNull()
    clickAt(400, 250)
    expect(game.pointer.takePending()).not.toBeNull()
  })
})

describe('what a ray can hit (CA-12)', () => {
  it('skips a glTF that has not loaded, hits it once it has, and skips it again when it is destroyed', async () => {
    const { game, models } = await ready3dGame()
    models.hold('/slow.glb')
    const entities: SceneEntityJson[] = [
      { name: 'Slow', position: [0, 0, 0], components: [{ type: 'Model', props: { src: '/slow.glb' } }] },
      { name: 'Empty', position: [3, 0, 0] },
    ]
    loadScene(game, scene3d(entities, {}, CAMERA), registryOf({ Model }))
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0 })?.entity).toBeNull()

    models.release('/slow.glb')
    await game.assets.ready()
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0.4 })?.entity?.name).toBe('Slow')

    defined(game.find('Slow')).destroy()
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0 })?.entity).toBeNull()
  })

  it('serves the bridge through injectClick with canvas pixels, exactly as a real click does', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])
    const at = defined(game.worldToScreen({ x: 2, y: 0.5, z: 1 }))

    const injected = defined(game.pointer.injectClick(at.x, at.y), 'a pick')

    expect(injected.entity?.name).toBe('Crate')
    expect(game.pointer.takePending()).toBe(injected)
    expect(game.pointer.injectClick(320, 2)).toBeNull()
  })
})
