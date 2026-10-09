// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import { loadScene } from './scene.js'
import { resetFakeRendering } from './test-renderer.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d } from './test-game-3d.js'

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

const REGISTRY = registryOf({ Sun, PointLight })

describe('Runtime Snapshot lighting in a 3D scene (CA-16)', () => {
  it('reports the ambient, each Sun and each Point Light with their entity, pose and look', async () => {
    const { game } = await ready3dGame()
    loadScene(
      game,
      scene3d(
        [
          { name: 'Daylight', components: [{ type: 'Sun', props: { direction: [0, -2, 0], color: 0xffeecc, intensity: 2.5 } }] },
          {
            name: 'Lamp',
            position: [3, 1, -2],
            components: [{ type: 'PointLight', props: { color: 0xff8800, intensity: 6, distance: 12, offsetY: 2 } }],
          },
        ],
        { lighting: { ambient: { color: '#223344', intensity: 0.3 } } },
      ),
      REGISTRY,
    )

    const { lighting } = runtimeBridgeOf(game).inspect({})

    expect(lighting.ambient).toEqual({ color: '#223344', intensity: 0.3 })
    expect(lighting.lights).toEqual([])
    const sun = lighting.sun ?? []
    const lamps = lighting.pointLights ?? []
    expect(sun.map(({ entity, direction, color, intensity }) => ({ entity, direction, color, intensity }))).toEqual([
      { entity: 'Daylight', direction: [0, -1, 0], color: '#ffeecc', intensity: 2.5 },
    ])
    expect(lamps.map(({ entity, position, color, intensity, distance }) => ({ entity, position, color, intensity, distance }))).toEqual([
      { entity: 'Lamp', position: [3, 3, -2], color: '#ff8800', intensity: 6, distance: 12 },
    ])
    expect([...sun, ...lamps].every(({ id }) => id.startsWith('entity-'))).toBe(true)
  })

})

describe('Runtime Snapshot lighting, empty and 2D (CA-16)', () => {
  it('reports empty lists for a 3D scene with no 3D lights', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), REGISTRY)
    const { lighting } = runtimeBridgeOf(game).inspect({})
    expect(lighting.sun).toEqual([])
    expect(lighting.pointLights).toEqual([])
  })

  it('leaves a 2D snapshot as it was: only ambient and lights', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Sun', components: [{ type: 'Sun' }] }] }, REGISTRY)
    const { lighting } = runtimeBridgeOf(game).inspect({})
    expect(Object.keys(lighting).sort()).toEqual(['ambient', 'lights'])
  })
})
