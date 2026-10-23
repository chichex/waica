// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { loadScene } from './scene.js'
import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { makeGame, renderFrame } from './test-sprite-batches.js'
import { defined } from './test-support.js'
import { fakeRendering, lastFakeRenderer } from './test-renderer.js'

use3dTestEnvironment()

it('loads independent scene shadow defaults and updates policy without changing ambient light (CA-5)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({}))

  expect(game.shadows.policy).toEqual({ quality: 'medium', maxDistance: 40 })
  game.shadows.quality = 'low'
  game.shadows.maxDistance = 12
  expect(game.shadows.policy).toEqual({ quality: 'low', maxDistance: 12 })
  expect(game.lighting.ambient).toEqual({ color: '#ffffff', intensity: 1 })

  loadScene(game, scene3d([], { shadows: { quality: 'off', maxDistance: 8 } }), registryOf({}))
  expect(game.shadows.policy).toEqual({ quality: 'off', maxDistance: 8 })
  game.unloadScene()
  loadScene(game, scene3d([]), registryOf({}))
  expect(game.shadows.policy).toEqual({ quality: 'medium', maxDistance: 40 })
})

it('resets the scene-scoped shadow policy when the live scene is unloaded (CA-8)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([], { shadows: { quality: 'off', maxDistance: 8 } }), registryOf({}))

  game.unloadScene()

  expect(game.shadows.policy).toEqual({ quality: 'medium', maxDistance: 40 })
  expect(game.shadows.quality).toBe('medium')
  renderFrame(game)
  expect(lastFakeRenderer().shadowMap.enabled).toBe(false)
  game.dispose()
})

it('gives manual 3D renders distinct renderer frames without double-advancing a native frame (CA-17)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({}))
  const clock = lastFakeRenderer()._nodes.nodeFrame
  renderFrame(game)
  const first = clock.frameId
  renderFrame(game)
  renderFrame(game)
  expect(clock.frameId).toBe(first + 2)

  clock.update()
  const nativeFrame = clock.frameId
  renderFrame(game)
  expect(clock.frameId).toBe(nativeFrame)
})

it('reports a missing Three frame-clock contract explicitly and leaves 2D rendering available (CA-17)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({}))
  Reflect.deleteProperty(lastFakeRenderer(), '_nodes')
  expect(() => renderFrame(game)).toThrow(/NodeFrame clock/)

  loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))
  expect(() => renderFrame(game)).not.toThrow()
})

it('rejects unsupported active sizes before changing the last valid live policy or light (CA-3)', async () => {
  const { game } = await ready3dGame()
  lastFakeRenderer().maxTextureSize = 2048
  lastFakeRenderer().backend.device.limits.maxTextureDimension2D = 2048
  loadScene(game, scene3d([]), registryOf({ Sun }))
  const sun = game.spawn('Sun').add(Sun)
  renderFrame(game)

  expect(() => { game.shadows.quality = 'high' }).toThrow(/4096.*2048/)
  expect(game.shadows.quality).toBe('medium')
  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([2048, 2048])
  expect(() => { sun.shadowMapSize = 4096 }).toThrow(/4096.*2048/)
  expect(sun.shadowMapSize).toBeNull()

  game.shadows.quality = 'off'
  expect(() => { sun.shadowMapSize = 4096 }).not.toThrow()
  expect(() => { game.shadows.quality = 'medium' }).toThrow(/4096.*2048/)
  expect(game.shadows.quality).toBe('off')
  sun.shadowMapSize = null
  game.shadows.quality = 'low'
  renderFrame(game)
  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([1024, 1024])
})

it('reports unsupported initial maps through ready and can recover with global Off (CA-3)', async () => {
  fakeRendering.init = 'pending'
  const game = makeGame()
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  loadScene(game, scene3d([
    { name: 'Sun', components: [{ type: 'Sun', props: { shadowMapSize: 4096 } }] },
  ]), registryOf({ Sun }))
  renderer.resolveInit('webgl2')

  await expect(game.ready()).rejects.toThrow(/4096.*2048/)
  expect(defined(defined(game.find('Sun')).get(Sun)).light?.shadow.map).toBeNull()
  expect(renderer.renders).toBe(0)
  game.shadows.quality = 'off'
  await expect(game.ready()).resolves.toBeUndefined()
  renderFrame(game)
  expect(defined(defined(game.find('Sun')).get(Sun)).light?.castShadow).toBe(false)
})

it('applies both light shadow profiles before rendering without a Simulation Step (CA-5)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ Sun, PointLight }))
  const sun = game.spawn('Sun').add(Sun)
  const lamp = game.spawn('Lamp').add(PointLight, { distance: 9 })
  game.simulate = false

  renderFrame(game)

  expect(defined(sun.light).castShadow).toBe(true)
  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([2048, 2048])
  expect(defined(lamp.light).castShadow).toBe(true)
  expect(defined(lamp.light).shadow.mapSize.toArray()).toEqual([512, 512])
  expect(defined(lamp.light).shadow.camera.far).toBe(9)

  game.shadows.quality = 'off'
  renderFrame(game)
  expect([defined(sun.light).castShadow, defined(lamp.light).castShadow]).toEqual([false, false])
  expect([sun.castShadows, lamp.castShadows]).toEqual([true, true])

  lamp.shadowBias = 0
  lamp.shadowRadius = 0
  lamp.castShadows = false
  game.shadows.quality = 'low'
  renderFrame(game)
  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([1024, 1024])
  expect(defined(sun.light).castShadow).toBe(true)
  expect(defined(lamp.light).castShadow).toBe(false)
  lamp.castShadows = true
  renderFrame(game)
  expect([defined(lamp.light).castShadow, defined(lamp.light).shadow.bias, defined(lamp.light).shadow.radius]).toEqual([true, 0, 0])
})

it('keeps the shadow range when Three reapplies a finite luminous distance at render (CA-7)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ PointLight }))
  const lamp = game.spawn('Lamp').add(PointLight, { distance: 9, intensity: 7, shadowMaxDistance: 2 })
  const light = defined(lamp.light)
  // The renderer boundary models Three 0.186's documented far overwrite.
  fakeRendering.onRender = () => {
    const node = light.shadow.shadowNode
    const shadowLight = node instanceof THREE.PointShadowNode ? node.light : light
    if (shadowLight instanceof THREE.PointLight) {
      light.shadow.camera.far = shadowLight.distance || light.shadow.camera.far
    }
  }

  renderFrame(game)

  expect(light.shadow.camera.far).toBe(2)
  expect(light.distance).toBe(9)
  expect(light.intensity).toBe(7)
  expect(game.scene.children.filter((node) => node instanceof THREE.PointLight)).toEqual([])
})

it('fits the Sun to the active camera away from the origin and disables empty coverage (CA-6)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([], {}, {
    kind: 'perspective', position: [100, 5, 110], target: [100, 0, 100],
  }), registryOf({ Sun }))
  const sun = game.spawn('Sun').add(Sun)
  const light = defined(sun.light)
  const sceneCamera = game.cameraRig.sceneCamera.position.clone()
  renderFrame(game)

  const receiver = new THREE.Vector3(100, 0, 100).project(light.shadow.camera)
  expect(Math.abs(receiver.x)).toBeLessThan(1)
  expect(Math.abs(receiver.y)).toBeLessThan(1)

  const editorCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  editorCamera.position.set(200, 5, 10)
  editorCamera.lookAt(200, 0, 0)
  game.cameraRig.setViewCamera(editorCamera)
  renderFrame(game)
  const editedReceiver = new THREE.Vector3(200, 0, 0).project(light.shadow.camera)
  expect(Math.abs(editedReceiver.x)).toBeLessThan(1)
  expect(Math.abs(editedReceiver.y)).toBeLessThan(1)
  expect(game.cameraRig.sceneCamera.position.toArray()).toEqual(sceneCamera.toArray())

  game.shadows.maxDistance = 0.01
  renderFrame(game)
  expect(game.shadows.resolve(sun).enabled).toBe(false)
  expect(light.castShadow).toBe(false)
})

it('prepares the current Sun coverage for a host without drawing or advancing simulation (CA-14)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ Sun }))
  const sun = game.spawn('Sun').add(Sun)
  game.camera.position.x += 300
  game.camera.updateMatrixWorld()
  const before = game.camera.position.toArray()

  const camera = game.shadows.prepareSunCamera(sun)

  expect(camera).toBe(defined(sun.light).shadow.camera)
  const receiver = new THREE.Vector3(300, 0, 0).project(defined(camera))
  expect(Math.abs(receiver.x)).toBeLessThan(1)
  expect(game.camera.position.toArray()).toEqual(before)
  expect(game.time.now).toBe(0)
  expect(fakeRendering.draws).toEqual([])
  expect(fakeRendering.renderTargets).toEqual([])
  game.shadows.quality = 'off'
  expect(game.shadows.prepareSunCamera(sun)).toBeNull()
})
