// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Sun } from './components/sun.js'
import { PointLight } from './components/point-light.js'
import type { Game } from './game.js'
import type { RenderBackend } from './render-readiness.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { fakeRendering, lastFakeRenderer } from './test-renderer.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

async function limitedGame(backend: RenderBackend = 'webgpu'): Promise<Game> {
  fakeRendering.init = backend
  const { game } = await ready3dGame()
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  loadScene(game, scene3d([]), registryOf({ Sun, PointLight }))
  fakeRendering.onRender = (scene) => {
    if (!(scene instanceof THREE.Scene)) return
    scene.traverse((node) => {
      if ((node instanceof THREE.DirectionalLight || node instanceof THREE.PointLight) && node.castShadow) {
        expect(node.shadow.mapSize.x).toBeLessThanOrEqual(2048)
      }
    })
  }
  game.simulate = false
  return game
}

/** Drive the public animation loop at the GPU boundary, without Simulation Steps. */
function draw(game: Game): void {
  game.start()
  defined(lastFakeRenderer().loop)(0)
  game.stop()
}

it.each(['webgl2', 'webgpu'] as const)('rejects an unsupported late-added Sun before publishing it and keeps drawing the last valid scene on %s', async (backend) => {
  const game = await limitedGame(backend)
  const valid = game.spawn('Valid').add(Sun)
  draw(game)
  const light = defined(valid.light)
  const target = new THREE.RenderTarget(2048, 2048)
  light.shadow.map = target
  const dispose = vi.fn()
  target.addEventListener('dispose', dispose)
  const late = game.spawn('Late')

  expect(() => late.add(Sun, { shadowMapSize: 4096 })).toThrow(/4096.*2048/)

  expect(late.get(Sun)).toBeUndefined()
  expect(game.scene.children.filter((node) => node instanceof THREE.DirectionalLight)).toEqual([light])
  expect(() => draw(game)).not.toThrow()
  expect(lastFakeRenderer().renders).toBe(2)
  expect(light.shadow.map).toBe(target)
  expect(dispose).not.toHaveBeenCalled()
  game.dispose()
})

it.each([Sun, PointLight])('validates composed late-add props and waica.params.json for %s', async (Class) => {
  const game = await limitedGame()
  const inactive = game.spawn('Inactive').add<Sun | PointLight>(Class, { shadowMapSize: 4096, castShadows: false })
  expect(inactive.shadowMapSize).toBe(4096)
  expect(inactive.castShadows).toBe(false)
  const params = { Late: { [Class.componentName]: { shadowMapSize: 4096 } } }
  await game.loadParams(`data:application/json,${encodeURIComponent(JSON.stringify(params))}`)
  const late = game.spawn('Late')

  expect(() => late.add<Sun | PointLight>(Class, { shadowMapSize: 1024 })).toThrow(/4096.*2048/)

  expect(late.get<Sun | PointLight>(Class)).toBeUndefined()
  params.Late[Class.componentName] = { shadowMapSize: 1024 }
  await game.loadParams(`data:application/json,${encodeURIComponent(JSON.stringify(params))}`)
  const valid = late.add<Sun | PointLight>(Class, { shadowMapSize: 4096 })
  expect(valid.shadowMapSize).toBe(1024)
  game.shadows.quality = 'off'
  const off = game.spawn('Off').add<Sun | PointLight>(Class, { shadowMapSize: 4096 })
  expect(off.castShadows).toBe(true)
  expect(() => draw(game)).not.toThrow()
  expect(defined(off.light).castShadow).toBe(false)
  game.dispose()
})

it('applies runtime parameter overrides as one final request, independent of property order', async () => {
  const game = await limitedGame()
  const entity = game.spawn('Lamp')
  const lamp = entity.add(PointLight)
  draw(game)
  game.paramOverrides = { Lamp: { PointLight: { shadowMapSize: 4096, castShadows: false } } }

  expect(() => game.applyParamOverrides(entity, lamp)).not.toThrow()

  draw(game)
  expect(lamp.shadowMapSize).toBe(4096)
  expect(lamp.castShadows).toBe(false)
  expect(defined(lamp.light).castShadow).toBe(false)
  expect(() => { lamp.castShadows = true }).toThrow(/4096.*2048/)
  expect(lamp.castShadows).toBe(false)
  game.paramOverrides.Lamp = { PointLight: { shadowMapSize: 1024, castShadows: true } }
  game.applyParamOverrides(entity, lamp)
  draw(game)
  const light = defined(lamp.light)
  const target = new THREE.CubeRenderTarget(1024)
  light.shadow.map = target
  game.paramOverrides.Lamp = { PointLight: { intensity: 5, shadowMapSize: 4096 } }

  expect(() => game.applyParamOverrides(entity, lamp)).toThrow(/4096.*2048/)
  expect(lamp.shadowMapSize).toBe(1024)
  expect(lamp.intensity).toBe(1)
  expect(() => draw(game)).not.toThrow()
  expect(light.shadow.map).toBe(target)
  game.dispose()
})

it('rejects a scene swap before unloading the previous valid scene or adopting its policy', async () => {
  const game = await limitedGame()
  const registry = registryOf({ Sun })
  game.registerSceneCatalog({
    registry,
    scenes: {
      valid: scene3d([{ name: 'Valid', components: [{ type: 'Sun' }] }]),
      unsupported: scene3d([{ name: 'Incoming', components: [{ type: 'Sun' }] }], { shadows: { quality: 'high' } }),
    },
  })
  game.loadSceneByName('valid')
  const entity = defined(game.find('Valid'))
  const light = defined(defined(entity.get(Sun)).light)
  draw(game)
  const target = new THREE.RenderTarget(2048, 2048)
  light.shadow.map = target
  const dispose = vi.fn()
  target.addEventListener('dispose', dispose)

  expect(() => game.loadSceneByName('unsupported')).toThrow(/4096.*2048/)

  expect(game.sceneName).toBe('valid')
  expect(game.find('Valid')).toBe(entity)
  expect(entity.alive).toBe(true)
  expect(game.find('Incoming')).toBeUndefined()
  expect(game.shadows.quality).toBe('medium')
  expect(light.shadow.map).toBe(target)
  expect(dispose).not.toHaveBeenCalled()
  expect(() => draw(game)).not.toThrow()
  expect(lastFakeRenderer().renders).toBe(2)
  game.dispose()
})

it('preflights prefab, instance and parameter composition before a runtime swap', async () => {
  const game = await limitedGame()
  const previous = game.spawn('Previous').add(Sun)
  const registry = {
    ...registryOf({ Sun }),
    prefabs: { lamp: { waicaPrefab: 1 as const, type: 'object' as const, components: [{ type: 'Sun', props: { shadowMapSize: 4096 } }] } },
  }
  const scene = scene3d([{ name: 'Lamp', prefab: 'lamp', overrides: { Sun: { shadowMapSize: 1024 } } }])
  game.paramOverrides = { Lamp: { Sun: { shadowMapSize: 4096 } } }

  expect(() => loadScene(game, scene, registry)).toThrow(/4096.*2048/)

  expect(game.find('Previous')).toBe(previous.entity)
  game.paramOverrides.Lamp = { Sun: { shadowMapSize: 4096, castShadows: false } }
  expect(() => loadScene(game, scene, registry)).not.toThrow()
  const sun = defined(defined(game.find('Lamp')).get(Sun))
  expect(sun.shadowMapSize).toBe(4096)
  expect(sun.castShadows).toBe(false)
  draw(game)
  expect(defined(sun.light).castShadow).toBe(false)
  loadScene(game, scene3d([{ name: 'Off', components: [{ type: 'Sun', props: { shadowMapSize: 4096 } }] }], { shadows: { quality: 'off' } }), registry)
  draw(game)
  expect(defined(defined(defined(game.find('Off')).get(Sun)).light).castShadow).toBe(false)
  game.dispose()
})

it.each(['3d', '2d'] as const)('uses the retained Editor Camera when preflighting incoming 3D coverage from %s', async (space) => {
  const game = await limitedGame()
  game.cameraRig.setViewCamera(new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100))
  if (space === '2d') loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))
  const previous = game.spawn('Previous')
  previous.add(Sun)
  const incoming = scene3d([
    { name: 'Incoming', components: [{ type: 'Sun', props: { shadowMapSize: 4096 } }] },
  ], {}, { kind: 'perspective', near: 50 })

  expect(() => loadScene(game, incoming, registryOf({ Sun }))).toThrow(/4096.*2048/)

  expect(game.find('Previous')).toBe(previous)
  expect(previous.alive).toBe(true)
  expect(() => draw(game)).not.toThrow()
  game.dispose()
})

it.each(['near', 'far', 'view'] as const)('keeps drawing and reports an unsupported Sun coverage reactivation once via %s', async (change) => {
  const game = await limitedGame()
  const sun = game.spawn('Sun').add(Sun)
  const validLamp = game.spawn('Lamp').add(PointLight)
  draw(game)
  const camera = game.camera
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected a perspective camera')
  if (change === 'far') camera.far = camera.near
  else camera.near = 50
  camera.updateProjectionMatrix()
  draw(game)
  sun.shadowMapSize = 4096
  draw(game)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  if (change === 'view') game.cameraRig.setViewCamera(new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100))
  else if (change === 'far') camera.far = 100
  else camera.near = 0.1
  camera.updateProjectionMatrix()

  expect(() => draw(game)).not.toThrow()

  expect(defined(sun.light).shadow.mapSize.toArray()).toEqual([2048, 2048])
  expect(defined(sun.light).castShadow).toBe(true)
  expect(defined(validLamp.light).castShadow).toBe(true)
  expect(sun.shadowMapSize).toBe(4096)
  expect(game.shadows.resolve(sun)).toMatchObject({ enabled: true, mapSize: 2048 })
  for (let frame = 0; frame < 3; frame++) draw(game)
  expect(lastFakeRenderer().renders).toBe(7)
  expect(error).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/Sun.*4096.*2048/))
  sun.shadowMapSize = 1024
  draw(game)
  expect(defined(sun.light).shadow.mapSize.x).toBe(1024)
  expect(error).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('reports a render-only capacity failure without allocating a map when no valid configuration exists', async () => {
  const game = await limitedGame()
  loadScene(game, scene3d([
    { name: 'Sun', components: [{ type: 'Sun', props: { shadowMapSize: 4096 } }] },
  ], {}, { kind: 'perspective', near: 50 }), registryOf({ Sun }))
  const sun = defined(defined(game.find('Sun')).get(Sun))
  draw(game)
  expect(defined(sun.light).castShadow).toBe(false)
  game.camera.near = 0.1
  game.camera.updateProjectionMatrix()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => draw(game)).not.toThrow()

  draw(game)
  expect(lastFakeRenderer().renders).toBe(3)
  expect(defined(sun.light).castShadow).toBe(false)
  expect(defined(sun.light).shadow.map).toBeNull()
  expect(game.shadows.resolve(sun).enabled).toBe(false)
  expect(error).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/Sun.*4096.*2048/))
  game.dispose()
})

it('offers a ready-device capacity check independent of the live scene space', async () => {
  const game = await limitedGame()
  const settings = { enabled: true, mapSize: 4096, maxDistance: 40, bias: 0, normalBias: 0, radius: 1 }
  loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))

  expect(() => game.shadows.assertCapacity(settings)).toThrow(/4096.*2048/)

  expect(() => game.shadows.assertCapacity({ ...settings, enabled: false })).not.toThrow()
  expect(() => game.shadows.assertCapacity({ ...settings, mapSize: 2048 })).not.toThrow()
  game.dispose()
})
