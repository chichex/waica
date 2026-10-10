// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGPURenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../packages/engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { CharacterMotor } from '@waica/behaviors'
import { authoringDefaults, Collider, Game, Model, PointLight, RigidBody, Sun, THREE, type SceneEntityJson, type SceneJson, type SceneRegistry } from '@waica/engine'
import { FakeModelBackend } from '../../../packages/engine/src/assets/test-helpers.js'
import { defined } from '../../../packages/engine/src/test-support.js'
import { renderFrame, stepFrame } from '../../../packages/engine/src/test-sprite-batches.js'
import { BINDINGS } from './controls'
import sceneFile from './scenes/main.scene.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const artFiles = import.meta.glob<string>('../art/*', { eager: true, query: '?url', import: 'default' })
const attribution = import.meta.glob<string>('../ATTRIBUTION.md', { eager: true, query: '?raw', import: 'default' })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An entity the tests read: a name, and components (when present) that are objects with a string type. */
function isEntity(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false
  const { components } = value
  return components === undefined || (Array.isArray(components) && components.every((c) => isRecord(c) && typeof c.type === 'string'))
}

/** The JSON file as the scene the Game loads: every field the tests read is checked here, not asserted. */
function isScene(value: unknown): value is SceneJson {
  if (!isRecord(value) || value.waicaScene !== 3) return false
  const { render, camera, entities } = value
  const optionalRecord = (field: unknown): boolean => field === undefined || isRecord(field)
  return optionalRecord(render) && optionalRecord(camera) && Array.isArray(entities) && entities.every(isEntity)
}

const scene: SceneJson = (() => {
  if (!isScene(sceneFile)) throw new Error('main.scene.json is not a v3 scene')
  return sceneFile
})()

const REGISTRY: SceneRegistry = { components: { Model, Sun, PointLight, Collider, RigidBody, CharacterMotor }, resolveAsset: (uri) => uri }

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
  const game = new Game({ canvas, background: 0x1a1a2e, models, bindings: BINDINGS })
  game.registerSceneCatalog({ scenes: { main: scene }, registry: REGISTRY })
  game.loadSceneByName('main')
  return { game, models }
}

const typesOf = (entity: SceneEntityJson): string[] => (entity.components ?? []).map((component) => component.type)

describe('examples/smoke-3d main scene (CA-17)', () => {
  it('declares a 3d space, a perspective camera and an Ambient Light', () => {
    expect(scene.render?.space).toBe('3d')
    expect(scene.camera?.kind).toBe('perspective')
    expect(scene.render?.lighting?.ambient).toBeDefined()
  })

  it('holds the ground, a box, a sphere, a glTF, a player, a step, a wall and a crate as Models, one Sun and one Point Light, and no 2D component', () => {
    const modelProps = scene.entities
      .flatMap((entity) => entity.components ?? [])
      .filter((component) => component.type === 'Model')
      .map((component) => component.props ?? {})
    expect(modelProps.map((props) => (typeof props.src === 'string' ? 'glb' : props.shape)).sort()).toEqual([
      'box',
      'box',
      'box',
      'box',
      'box',
      'glb',
      'plane',
      'sphere',
    ])
    expect(scene.entities.filter((entity) => typesOf(entity).includes('Sun'))).toHaveLength(1)
    expect(scene.entities.filter((entity) => typesOf(entity).includes('PointLight'))).toHaveLength(1)
    const allowed = new Set(['Model', 'Sun', 'PointLight', 'Collider', 'RigidBody', 'CharacterMotor'])
    expect(scene.entities.flatMap(typesOf).every((type) => allowed.has(type))).toBe(true)
  })

  it('ships the glb its Model names, and says where it came from', () => {
    const glb = scene.entities.flatMap((entity) => entity.components ?? []).find((component) => typeof component.props?.src === 'string')
    expect(glb?.props).toMatchObject({ src: 'src/art/tree.glb' })
    expect(Object.keys(artFiles)).toContain('../art/tree.glb')
    expect(Object.values(attribution).join('')).toMatch(/tree\.glb/)
  })
})

describe('examples/smoke-3d simulates (issue #159 CA-22)', () => {
  const byName = (name: string): SceneEntityJson => defined(scene.entities.find((entity) => entity.name === name))
  const propsOf = (name: string, type: string): Record<string, unknown> | undefined =>
    byName(name).components?.find((component) => component.type === type)?.props

  it('declares the world gravity and what stands, walks and falls in it', () => {
    expect(scene.simulation).toEqual({ gravity: [0, -9.81, 0] })
    expect(typesOf(byName('Ground'))).toEqual(['Model', 'Collider'])
    // The props the Player walks among are solid too (PR #164 finding 9): fixed colliders sized to their models.
    expect(typesOf(byName('Box'))).toEqual(['Model', 'Collider'])
    expect(propsOf('Box', 'Collider')).toEqual({ size: [1.5, 1.5, 1.5] })
    expect(typesOf(byName('Sphere'))).toEqual(['Model', 'Collider'])
    expect(propsOf('Sphere', 'Collider')).toEqual({ shape: 'sphere', radius: 1 })
    expect(typesOf(byName('Tree'))).toEqual(['Model', 'Collider'])
    expect(propsOf('Tree', 'Collider')).toMatchObject({ shape: 'box' })
    expect(typesOf(byName('Player'))).toEqual(['Model', 'Collider', 'RigidBody', 'CharacterMotor'])
    expect(propsOf('Player', 'RigidBody')).toEqual({ type: 'kinematic' })
    expect(byName('Player').position).toEqual([-1, 0.9, 3])
    expect(typesOf(byName('Step'))).toEqual(['Model', 'Collider'])
    expect(typesOf(byName('Wall'))).toEqual(['Model', 'Collider'])
    expect(typesOf(byName('Crate'))).toEqual(['Model', 'Collider', 'RigidBody'])
    expect(byName('Crate').position).toEqual([2, 4, 0])
    expect(propsOf('Crate', 'RigidBody')).toBeUndefined()
  })

  it('binds every action the CharacterMotor reads by default, arrows and WASD for walking and Space for jumping', () => {
    const defaults = authoringDefaults(CharacterMotor)
    const actions = [defaults.leftAction, defaults.rightAction, defaults.forwardAction, defaults.backAction, defaults.jumpAction]
    expect(actions.sort()).toEqual(Object.keys(BINDINGS).sort())
    expect(BINDINGS.jump).toEqual(['Space'])
    expect(BINDINGS.up).toEqual(['ArrowUp', 'KeyW'])
  })
})

describe('examples/smoke-3d plays (issue #159 CA-22)', () => {
  it('rests the Crate on the Ground and stands the Player on it after 120 frames', async () => {
    const { game } = boot()
    await game.assets.ready()

    for (let frame = 0; frame < 120; frame += 1) stepFrame(game)

    expect(defined(game.find('Crate')).position.y).toBeCloseTo(0.5, 2)
    expect(defined(defined(game.find('Player')).get(RigidBody)).grounded).toBe(true)
    expect(defined(game.find('Player')).position.y).toBeCloseTo(0.9, 1)
    game.dispose()
  })

  it('stops the Player at the Wall and climbs the Step on its way', async () => {
    const { game } = boot()
    await game.assets.ready()
    // The Player's CharacterMotor walks right while the action is held.
    game.input.injectAction('right', 'hold')

    // 20 frames at 6 units a second: x = 1, over the Step (x from 0 to 2).
    for (let frame = 0; frame < 20; frame += 1) stepFrame(game)
    expect(defined(game.find('Player')).position.y).toBeCloseTo(0.3 + 0.9, 1)

    for (let frame = 0; frame < 190; frame += 1) stepFrame(game)
    // The Wall's face is at x = 4.35 and the capsule's radius is 0.4.
    expect(defined(game.find('Player')).position.x).toBeGreaterThan(4.35 - 0.4 - 0.05)
    expect(defined(game.find('Player')).position.x).toBeLessThan(4.35 - 0.4 + 0.001)
    game.dispose()
  })
})

describe('examples/smoke-3d boots like main.ts (CA-17)', () => {
  it('loads as a 3d scene with the perspective camera and every entity, the glb requested once', async () => {
    const { game, models } = boot()
    await game.assets.ready()

    expect(game.space).toBe('3d')
    expect(game.camera).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(game.camera.position.toArray()).toEqual([0, 5.5, 11])
    expect(game.entities.map((entity) => entity.name)).toEqual(['Ground', 'Box', 'Sphere', 'Tree', 'Daylight', 'Lamp', 'Player', 'Step', 'Wall', 'Crate'])
    expect(models.loadCalls).toEqual(['src/art/tree.glb'])
    // The glb, and the Rapier module the 3D scene loads (issue #159 CA-8 counts it as an asset).
    expect(game.assets.status).toEqual({ pending: 0, loaded: 2, failed: 0 })
    game.dispose()
  })

  it('places a model at a non-zero z, applies rotation and scale, and lights the scene', () => {
    const { game } = boot()
    expect(defined(game.find('Sphere')).position.z).toBe(1.5)
    expect(defined(game.find('Box')).node.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(30))
    expect(defined(game.find('Ground')).node.scale.toArray()).toEqual([24, 1, 24])
    expect(game.lighting.ambient).toEqual({ color: '#b8c8ff', intensity: 0.6 })
    const lightTypes = (): string[] => {
      const found: string[] = []
      game.scene.traverse((object) => {
        if (object instanceof THREE.Light) found.push(object.type)
      })
      return found
    }
    // The components' lights exist at load; the Game's own ambient light joins the scene when a frame draws.
    expect(lightTypes()).toEqual(expect.arrayContaining(['DirectionalLight', 'PointLight']))
    renderFrame(game)
    expect(lightTypes().sort()).toEqual(['AmbientLight', 'DirectionalLight', 'PointLight'])
    game.dispose()
  })
})
