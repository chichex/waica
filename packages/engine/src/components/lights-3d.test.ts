// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import type { Game } from '../game.js'
import { loadScene } from '../scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from '../test-game-3d.js'
import { renderFrame } from '../test-sprite-batches.js'
import { defined } from '../test-support.js'
import { PointLight } from './point-light.js'
import { Sun } from './sun.js'

use3dTestEnvironment()

/** Every object of one three class under the Game's scene. */
function lightsOf<T extends THREE.Light>(game: Game, Class: new (...args: never[]) => T): T[] {
  const found: T[] = []
  game.scene.traverse((object) => {
    if (object instanceof Class) found.push(object)
  })
  return found
}

/** The unit direction a directional light shines along, in world space. */
function shineOf(light: THREE.DirectionalLight): number[] {
  light.updateWorldMatrix(true, false)
  light.target.updateWorldMatrix(true, false)
  const from = light.getWorldPosition(new THREE.Vector3())
  const to = light.target.getWorldPosition(new THREE.Vector3())
  return to.sub(from).normalize().toArray().map((n) => Math.round(n * 1e6) / 1e6 || 0)
}

describe('Sun (CA-11)', () => {
  it('owns a DirectionalLight shining along direction in world space, wherever its entity is', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ Sun }))
    const entity = game.spawn('Sun')
    entity.position.set(40, 7, -3)
    entity.node.rotation.set(0.3, 1, 0.2)

    entity.add(Sun, { direction: [0, -1, 0], color: 0xffeecc, intensity: 2 })

    const [light] = lightsOf(game, THREE.DirectionalLight)
    expect(lightsOf(game, THREE.DirectionalLight)).toHaveLength(1)
    expect(shineOf(defined(light))).toEqual([0, -1, 0])
    expect(defined(light).color.getHex()).toBe(0xffeecc)
    expect(defined(light).intensity).toBe(2)
  })

  it('normalises the direction and updates the light when its props change', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ Sun }))
    const sun = game.spawn('Sun').add(Sun, { direction: [3, 0, 4] })
    const light = defined(lightsOf(game, THREE.DirectionalLight)[0])
    expect(shineOf(light)).toEqual([0.6, 0, 0.8])

    sun.direction = [0, 0, -2]
    sun.color = 0x112233
    sun.intensity = 0.5

    expect(shineOf(light)).toEqual([0, 0, -1])
    expect(light.color.getHex()).toBe(0x112233)
    expect(light.intensity).toBe(0.5)
  })

  it('keeps its last direction when given a zero vector', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ Sun }))
    const sun = game.spawn('Sun').add(Sun, { direction: [0, -1, 0] })
    sun.direction = [0, 0, 0]
    expect(shineOf(defined(lightsOf(game, THREE.DirectionalLight)[0]))).toEqual([0, -1, 0])
  })

})

describe('Sun, lifetime and defaults (CA-11)', () => {
  it('removes its light, and the light target, when destroyed', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ Sun }))
    const entity = game.spawn('Sun')
    entity.add(Sun)
    const light = defined(lightsOf(game, THREE.DirectionalLight)[0])
    entity.destroy()
    expect(lightsOf(game, THREE.DirectionalLight)).toHaveLength(0)
    expect(light.parent).toBeNull()
    expect(light.target.parent).toBeNull()
  })

  it('creates nothing in a 2D scene', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ Sun }))
    game.spawn('Sun').add(Sun)
    expect(lightsOf(game, THREE.DirectionalLight)).toHaveLength(0)
  })

  it('has the default direction, color and intensity the spec names', () => {
    expect(Sun.componentName).toBe('Sun')
    expect(authoringDefaults(Sun)).toEqual({ direction: [-1, -2, -1], color: 0xffffff, intensity: 1 })
    expect(Sun.params).toMatchObject({ direction: { kind: 'vector3' }, color: { kind: 'color' } })
  })
})

describe('PointLight (CA-11)', () => {
  it('owns a PointLight at the entity position plus its offset', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ PointLight }))
    const entity = game.spawn('Lamp')
    entity.position.set(10, 0, 0)

    entity.add(PointLight, { color: 0xffaa55, intensity: 5, distance: 8, decay: 1.5, offsetX: 1, offsetY: 2, offsetZ: 3 })

    const [light] = lightsOf(game, THREE.PointLight)
    expect(lightsOf(game, THREE.PointLight)).toHaveLength(1)
    entity.node.updateWorldMatrix(true, true)
    expect(defined(light).getWorldPosition(new THREE.Vector3()).toArray()).toEqual([11, 2, 3])
    expect(defined(light).color.getHex()).toBe(0xffaa55)
    expect([defined(light).intensity, defined(light).distance, defined(light).decay]).toEqual([5, 8, 1.5])
  })

  it('follows the entity as it moves', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ PointLight }))
    const entity = game.spawn('Lamp')
    entity.add(PointLight, { offsetY: 1 })
    const light = defined(lightsOf(game, THREE.PointLight)[0])
    entity.position.set(4, 0, -2)
    entity.node.updateWorldMatrix(true, true)
    expect(light.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([4, 1, -2])
  })

})

describe('PointLight, props and lifetime (CA-11)', () => {
  it('updates the light when its props change', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ PointLight }))
    const entity = game.spawn('Lamp')
    const lamp = entity.add(PointLight)
    const light = defined(lightsOf(game, THREE.PointLight)[0])

    lamp.color = 0x00ff00
    lamp.intensity = 9
    lamp.distance = 3
    lamp.decay = 1
    lamp.offsetX = 2
    lamp.offsetY = 3
    lamp.offsetZ = 4

    entity.node.updateWorldMatrix(true, true)
    expect(light.color.getHex()).toBe(0x00ff00)
    expect([light.intensity, light.distance, light.decay]).toEqual([9, 3, 1])
    expect(light.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([2, 3, 4])
  })

  it('removes its light when destroyed and creates nothing in a 2D scene', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ PointLight }))
    const entity = game.spawn('Lamp')
    entity.add(PointLight)
    entity.destroy()
    expect(lightsOf(game, THREE.PointLight)).toHaveLength(0)

    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ PointLight }))
    game.spawn('Lamp').add(PointLight)
    expect(lightsOf(game, THREE.PointLight)).toHaveLength(0)
  })

  it('has the defaults the spec names', () => {
    expect(PointLight.componentName).toBe('PointLight')
    expect(PointLight.displayName).toBe('Point light (3D)')
    expect(authoringDefaults(PointLight)).toEqual({
      color: 0xffffff, intensity: 1, distance: 0, decay: 2, offsetX: 0, offsetY: 0, offsetZ: 0,
    })
  })
})

describe('Ambient Light in a 3D scene (CA-11)', () => {
  it('drives one AmbientLight the Game owns from render.lighting.ambient: color and intensity', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([], { lighting: { ambient: { color: '#336699', intensity: 0.4 } } }), registryOf({}))
    renderFrame(game)
    const lights = lightsOf(game, THREE.AmbientLight)
    expect(lights).toHaveLength(1)
    expect(defined(lights[0]).color.getHexString()).toBe('336699')
    expect(defined(lights[0]).intensity).toBeCloseTo(0.4)
  })

  it('is full white with no lighting block', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({}))
    renderFrame(game)
    const [light] = lightsOf(game, THREE.AmbientLight)
    expect(defined(light).color.getHexString()).toBe('ffffff')
    expect(defined(light).intensity).toBe(1)
  })

})

describe('Ambient Light in a 3D scene, runtime (CA-11)', () => {
  it('follows the game.lighting.ambient setter at runtime', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({}))
    game.lighting.ambient = { color: '#ff0000', intensity: 0.25 }
    renderFrame(game)
    const [light] = lightsOf(game, THREE.AmbientLight)
    expect([defined(light).color.getHexString(), defined(light).intensity]).toEqual(['ff0000', 0.25])
  })

  it('exists only in a 3D scene: none in 2D, gone on unload, back on the next 3D scene', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, render: { lighting: { ambient: { intensity: 0.5 } } }, entities: [] }, registryOf({}))
    renderFrame(game)
    expect(lightsOf(game, THREE.AmbientLight)).toHaveLength(0)

    loadScene(game, scene3d([]), registryOf({}))
    renderFrame(game)
    expect(lightsOf(game, THREE.AmbientLight)).toHaveLength(1)

    game.unloadScene()
    renderFrame(game)
    expect(lightsOf(game, THREE.AmbientLight)).toHaveLength(0)

    loadScene(game, scene3d([]), registryOf({}))
    renderFrame(game)
    expect(lightsOf(game, THREE.AmbientLight)).toHaveLength(1)
  })
})

describe('Sun, direction from scene JSON (CA-11)', () => {
  it.each([['a string', 'abc'], ['a number', 3], ['null', null], ['an object', { x: 1 }], ['a NaN', [Number.NaN, -1, 0]], ['a short array', [0, -1]]])(
    'keeps the default direction and does not throw when it is %s',
    async (_label, direction) => {
      const { game } = await ready3dGame()
      const scene = scene3d([{ name: 'Sun', components: [{ type: 'Sun', props: { direction } }] }])
      expect(() => loadScene(game, scene, registryOf({ Sun }))).not.toThrow()
      expect(shineOf(defined(lightsOf(game, THREE.DirectionalLight)[0]))).toEqual([-0.408248, -0.816497, -0.408248])
    },
  )
})

describe('PointLight, offset frame (CA-11)', () => {
  it('is in the entity\'s local frame: it turns and scales with a rotated, scaled entity', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ PointLight }))
    const entity = game.spawn('Lamp')
    entity.position.set(10, 0, 0)
    entity.node.rotation.set(Math.PI / 2, 0, 0)
    entity.node.scale.set(2, 2, 2)
    entity.add(PointLight, { offsetY: 1 })

    const light = defined(lightsOf(game, THREE.PointLight)[0])
    light.updateWorldMatrix(true, false)
    const world = light.getWorldPosition(new THREE.Vector3())

    // +Y of the entity, turned 90 degrees about X and doubled: it ends 2 units along world +Z.
    expect(world.toArray().map((n) => Math.round(n * 1e6) / 1e6 || 0)).toEqual([10, 0, 2])
  })
})
