// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight } from './components/point-light.js'
import { SpotLight } from './components/spot-light.js'
import { Sun } from './components/sun.js'
import type { Game } from './game.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { fakeRendering, lastFakeRenderer } from './test-renderer.js'
import { renderFrame } from './test-sprite-batches.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

/** Models a renderer-owned target through Three's public allocation/disposal boundary. */
function allocateTarget(light: THREE.SpotLight, retained: Set<THREE.RenderTarget>): void {
  const size = light.shadow.mapSize.x
  const target = new THREE.RenderTarget(size, size)
  retained.add(target)
  target.addEventListener('dispose', () => { retained.delete(target) })
  light.shadow.map = target
}

async function limitedGame(): Promise<Game> {
  const { game } = await ready3dGame()
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  game.simulate = false
  return game
}

it('casts a SpotLight shadow by default at the Medium spot profile before render (issue #204 CA-5)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  const spot = game.spawn('Spot').add(SpotLight, { distance: 9, shadowMaxDistance: 2 })
  game.simulate = false

  renderFrame(game)

  const light = defined(spot.light)
  expect(light.castShadow).toBe(true)
  expect(light.shadow.mapSize.toArray()).toEqual([1024, 1024])
  expect(light.shadow.camera.far).toBe(2)
  expect(light.distance).toBe(9)
  expect(game.shadows.resolve(spot)).toMatchObject({ enabled: true, mapSize: 1024, maxDistance: 2 })
})

it('keeps the spot shadow range when Three updates its shadow matrices at render (issue #204 CA-6)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  const spot = game.spawn('Spot').add(SpotLight, { distance: 9, intensity: 7, shadowMaxDistance: 2 })
  const light = defined(spot.light)
  // The renderer boundary runs Three's shadow update, which stock reads `far` from light.distance.
  fakeRendering.onRender = () => { light.shadow.updateMatrices(light) }

  renderFrame(game)

  expect(light.shadow.camera.far).toBe(2)
  expect([light.distance, light.intensity]).toEqual([9, 7])
  spot.distance = 1
  renderFrame(game)
  expect(light.shadow.camera.far).toBe(1)
  spot.distance = 0
  spot.shadowMaxDistance = null
  renderFrame(game)
  expect(light.shadow.camera.far).toBe(40)
  expect(light.distance).toBe(0)
})

it('lets global Off and castShadows false disable only the spot shadow, keeping its light (issue #204 CA-5)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight, PointLight }))
  const spot = game.spawn('Spot').add(SpotLight, { intensity: 3 })
  const lamp = game.spawn('Lamp').add(PointLight)
  renderFrame(game)

  game.shadows.quality = 'off'
  renderFrame(game)
  expect([defined(spot.light).castShadow, defined(lamp.light).castShadow]).toEqual([false, false])
  expect(spot.castShadows).toBe(true)

  game.shadows.quality = 'low'
  spot.castShadows = false
  renderFrame(game)
  expect(defined(spot.light).castShadow).toBe(false)
  expect(defined(lamp.light).castShadow).toBe(true)
  expect(defined(spot.light).intensity).toBe(3)
  spot.castShadows = true
  renderFrame(game)
  expect(defined(spot.light).castShadow).toBe(true)
  expect(defined(spot.light).shadow.mapSize.toArray()).toEqual([512, 512])
})

it('releases its renderer-owned target on ten Off cycles and entity destruction (issue #204 CA-8)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  const entity = game.spawn('Spot')
  const spot = entity.add(SpotLight)
  const light = defined(spot.light)
  const retained = new Set<THREE.RenderTarget>()
  renderFrame(game)

  for (let cycle = 0; cycle < 10; cycle++) {
    allocateTarget(light, retained)
    expect(retained.size).toBe(1)
    game.shadows.quality = 'off'
    renderFrame(game)
    expect(retained.size).toBe(0)
    expect(light.shadow.map).toBeNull()
    expect(Object.hasOwn(light.shadow, 'updateMatrices')).toBe(false)
    game.shadows.quality = 'medium'
    renderFrame(game)
    expect(light.castShadow).toBe(true)
  }

  allocateTarget(light, retained)
  entity.destroy()
  expect(retained.size).toBe(0)
  expect(Object.hasOwn(light.shadow, 'updateMatrices')).toBe(false)
  expect(light.parent).toBeNull()
  expect(light.target.parent).toBeNull()
})

it('releases a resized spot map and the outgoing scene on a 3D to 2D swap (issue #204 CA-8)', async () => {
  const { game } = await ready3dGame()
  const retained = new Set<THREE.RenderTarget>()
  loadScene(game, scene3d([{ name: 'Spot', components: [{ type: 'SpotLight' }] }]), registryOf({ SpotLight }))
  renderFrame(game)
  const spot = defined(defined(game.find('Spot')).get(SpotLight))
  allocateTarget(defined(spot.light), retained)
  spot.shadowMapSize = 512
  renderFrame(game)
  expect(retained.size).toBe(0)

  allocateTarget(defined(spot.light), retained)
  loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))
  renderFrame(game)
  expect(retained.size).toBe(0)
  expect(game.scene.children.some((object) => object instanceof THREE.Light)).toBe(false)
  game.dispose()
})

it('rejects an unsupported spot map like a PointLight: late add, setter, cast flag and scene swap (issue #204 CA-5)', async () => {
  const game = await limitedGame()
  const late = game.spawn('Late')
  expect(() => late.add(SpotLight, { shadowMapSize: 4096 })).toThrow(/4096.*2048/)
  expect(late.get(SpotLight)).toBeUndefined()

  const spot = game.spawn('Spot').add(SpotLight)
  renderFrame(game)
  expect(() => { spot.shadowMapSize = 4096 }).toThrow(/4096.*2048/)
  expect(spot.shadowMapSize).toBeNull()
  expect(() => { game.shadows.quality = 'high' }).not.toThrow()
  renderFrame(game)
  expect(defined(spot.light).shadow.mapSize.toArray()).toEqual([2048, 2048])

  const inactive = game.spawn('Inactive').add(SpotLight, { shadowMapSize: 4096, castShadows: false })
  expect(() => { inactive.castShadows = true }).toThrow(/4096.*2048/)
  expect(inactive.castShadows).toBe(false)

  expect(() => loadScene(game, scene3d([
    { name: 'Big', components: [{ type: 'SpotLight', props: { shadowMapSize: 4096 } }] },
  ]), registryOf({ SpotLight }))).toThrow(/4096.*2048/)
  expect(game.find('Spot')).toBeDefined()
  game.dispose()
})

it('keeps Sun and PointLight profiles beside a SpotLight (issue #204 CA-9)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ Sun, PointLight, SpotLight }))
  const sun = game.spawn('Sun').add(Sun)
  const lamp = game.spawn('Lamp').add(PointLight, { distance: 9 })
  const spot = game.spawn('Spot').add(SpotLight)

  renderFrame(game)

  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([2048, 2048])
  expect(defined(lamp.light).shadow.mapSize.toArray()).toEqual([512, 512])
  expect(defined(lamp.light).shadow.camera.far).toBe(9)
  expect(defined(spot.light).shadow.mapSize.toArray()).toEqual([1024, 1024])
  expect(defined(spot.light).shadow.camera.far).toBe(40)
})

it('prepares the spot shadow camera from the current range before any render, and none when Off (issue #204 CA-7)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  const entity = game.spawn('Beam')
  entity.position.set(0, 5, 0)
  const spot = entity.add(SpotLight, { distance: 9, shadowMaxDistance: 2, angle: 30 })
  const light = defined(spot.light)

  const camera = game.shadows.prepareSpotCamera(spot)

  expect(camera).toBe(light.shadow.camera)
  expect([light.shadow.camera.near, light.shadow.camera.far]).toEqual([0.02, 2])
  expect(light.shadow.camera.fov).toBeCloseTo(60, 9)
  expect(new THREE.Vector3(0, 3.5, 0).project(defined(camera)).z).toBeLessThanOrEqual(1)
  expect(new THREE.Vector3(0, 0, 0).project(defined(camera)).z).toBeGreaterThan(1)
  expect(light.distance).toBe(9)
  expect(fakeRendering.draws).toEqual([])
  expect(fakeRendering.renderTargets).toEqual([])
  spot.angle = 45
  spot.shadowMaxDistance = 5
  expect(game.shadows.prepareSpotCamera(spot)?.far).toBe(5)
  expect(light.shadow.camera.fov).toBeCloseTo(90, 9)
  game.shadows.quality = 'off'
  expect(game.shadows.prepareSpotCamera(spot)).toBeNull()
  game.dispose()
})
