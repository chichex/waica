// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGPURenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../packages/engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Game, Model, PointLight, Sun, THREE, type SceneJson, type SceneRegistry } from '@waica/engine'
import { FakeModelBackend } from '../../../packages/engine/src/assets/test-helpers.js'
import { defined } from '../../../packages/engine/src/test-support.js'
import sceneFile from './scenes/main.scene.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const artFiles = import.meta.glob<string>('./art/*', { eager: true, query: '?url', import: 'default' })
const attribution = import.meta.glob<string>('../ATTRIBUTION.md', { eager: true, query: '?raw', import: 'default' })

/** The JSON file as the scene the Game loads, checked rather than asserted. */
function isScene(value: unknown): value is SceneJson {
  return typeof value === 'object' && value !== null && 'waicaScene' in value && value.waicaScene === 3 && 'entities' in value && Array.isArray(value.entities)
}

const scene: SceneJson = (() => {
  if (!isScene(sceneFile)) throw new Error('main.scene.json is not a v3 scene')
  return sceneFile
})()

const REGISTRY: SceneRegistry = { components: { Model, Sun, PointLight }, resolveAsset: (uri) => uri }

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The example booted as main.ts boots it (a catalog, then "main"), with a fake glTF backend. */
function boot(): { game: Game; models: FakeModelBackend } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const models = new FakeModelBackend()
  const game = new Game({ canvas, background: 0x1a1a2e, models })
  game.registerSceneCatalog({ scenes: { main: scene }, registry: REGISTRY })
  game.loadSceneByName('main')
  return { game, models }
}

const componentsOf = (name: string) => scene.entities.find((entity) => entity.name === name)?.components ?? []
const typesOf = (name: string): string[] => componentsOf(name).map((component) => component.type)

describe('examples/smoke-3d main scene (CA-17)', () => {
  it('declares a 3d space, a perspective camera and an Ambient Light', () => {
    expect(scene.render?.space).toBe('3d')
    expect(scene.camera?.kind).toBe('perspective')
    expect(scene.render?.lighting?.ambient).toBeDefined()
  })

  it('holds a ground plane, a box, a sphere, a glTF, one Sun and one Point Light, and no 2D component', () => {
    const modelProps = scene.entities
      .flatMap((entity) => entity.components ?? [])
      .filter((component) => component.type === 'Model')
      .map((component) => component.props ?? {})
    expect(modelProps.map((props) => (typeof props.src === 'string' ? 'glb' : props.shape)).sort()).toEqual(['box', 'glb', 'plane', 'sphere'])
    expect(scene.entities.filter((entity) => typesOf(entity.name).includes('Sun'))).toHaveLength(1)
    expect(scene.entities.filter((entity) => typesOf(entity.name).includes('PointLight'))).toHaveLength(1)
    const allowed = new Set(['Model', 'Sun', 'PointLight'])
    expect(scene.entities.flatMap((entity) => typesOf(entity.name)).every((type) => allowed.has(type))).toBe(true)
  })

  it('ships the glb its Model names, and says where it came from', () => {
    const glb = scene.entities.flatMap((entity) => entity.components ?? []).find((component) => typeof component.props?.src === 'string')
    expect(glb?.props).toMatchObject({ src: 'src/art/tree.glb' })
    expect(Object.keys(artFiles)).toContain('./art/tree.glb')
    expect(Object.values(attribution).join('')).toMatch(/tree\.glb/)
  })
})

describe('examples/smoke-3d boots like main.ts (CA-17)', () => {
  it('loads as a 3d scene with the perspective camera and every entity, the glb requested once', async () => {
    const { game, models } = boot()
    await game.assets.ready()

    expect(game.space).toBe('3d')
    expect(game.camera).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(game.camera.position.toArray()).toEqual([0, 5.5, 11])
    expect(game.entities.map((entity) => entity.name)).toEqual(['Ground', 'Box', 'Sphere', 'Tree', 'Daylight', 'Lamp'])
    expect(models.loadCalls).toEqual(['src/art/tree.glb'])
    expect(game.assets.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    game.dispose()
  })

  it('places a model at a non-zero z, applies rotation and scale, and lights the scene', () => {
    const { game } = boot()
    expect(defined(game.find('Sphere')).position.z).toBe(1.5)
    expect(defined(game.find('Box')).node.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(30))
    expect(defined(game.find('Ground')).node.scale.toArray()).toEqual([24, 1, 24])
    expect(game.lighting.ambient).toEqual({ color: '#b8c8ff', intensity: 0.6 })
    const lights: string[] = []
    game.scene.traverse((object) => {
      if (object instanceof THREE.Light) lights.push(object.type)
    })
    expect(lights.sort()).toEqual(['DirectionalLight', 'PointLight'])
    game.dispose()
  })
})
