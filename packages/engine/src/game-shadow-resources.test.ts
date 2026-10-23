// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { renderFrame } from './test-sprite-batches.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

/** Models a renderer-owned target through Three's public allocation/disposal boundary. */
function allocateTarget(light: THREE.DirectionalLight | THREE.PointLight, retained: Set<THREE.RenderTarget>): void {
  const size = light.shadow.mapSize.x
  const target = light instanceof THREE.PointLight ? new THREE.CubeRenderTarget(size) : new THREE.RenderTarget(size, size)
  retained.add(target)
  target.addEventListener('dispose', () => { retained.delete(target) })
  light.shadow.map = target
}

it('releases renderer-owned targets on ten Off cycles and entity destruction (CA-8)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ Sun, PointLight }))
  const entities = [game.spawn('Sun'), game.spawn('Lamp')]
  const sun = defined(entities[0]).add(Sun)
  const lamp = defined(entities[1]).add(PointLight)
  const lights = [defined(sun.light), defined(lamp.light)]
  const retained = new Set<THREE.RenderTarget>()
  renderFrame(game)

  for (let cycle = 0; cycle < 10; cycle++) {
    for (const light of lights) allocateTarget(light, retained)
    expect(retained.size).toBe(2)
    game.shadows.quality = 'off'
    renderFrame(game)
    expect(retained.size).toBe(0)
    expect(lights.map((light) => light.shadow.map)).toEqual([null, null])
    game.shadows.quality = 'medium'
    renderFrame(game)
    expect(lights.map((light) => light.castShadow)).toEqual([true, true])
  }

  for (const light of lights) allocateTarget(light, retained)
  for (const entity of entities) entity.destroy()
  expect(retained.size).toBe(0)
})

it('retires resized GPU storage without disposing the cached active shadow node (CA-15)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ PointLight }))
  const lamp = game.spawn('Lamp').add(PointLight)
  renderFrame(game)
  const light = defined(lamp.light)
  allocateTarget(light, new Set())
  const target = defined(light.shadow.map)
  const node = light.shadow.shadowNode
  let disposals = 0
  target.addEventListener('dispose', () => { disposals++ })

  for (const quality of ['low', 'high', 'medium'] as const) {
    game.shadows.quality = quality
    renderFrame(game)
    expect(light.shadow.shadowNode).toBe(node)
    expect(light.shadow.map).toBe(target)
    expect([target.width, target.height]).toEqual([light.shadow.mapSize.x, light.shadow.mapSize.y])
  }
  expect(disposals).toBe(3)
})

it('releases resized maps but retains maps for bias, radius and camera changes (CA-8)', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ Sun, PointLight }))
  const sun = game.spawn('Sun').add(Sun)
  const lamp = game.spawn('Lamp').add(PointLight)
  const lights = [defined(sun.light), defined(lamp.light)]
  const retained = new Set<THREE.RenderTarget>()
  renderFrame(game)
  for (const light of lights) allocateTarget(light, retained)

  game.shadows.quality = 'low'
  renderFrame(game)
  expect(retained.size).toBe(0)
  for (const light of lights) allocateTarget(light, retained)
  const maps = lights.map((light) => light.shadow.map)
  sun.shadowBias = 0
  lamp.shadowRadius = 3
  game.camera.position.x += 1
  renderFrame(game)
  expect(lights.map((light) => light.shadow.map)).toEqual(maps)
  expect(retained.size).toBe(2)
  game.dispose()
  expect(retained.size).toBe(0)
})

it('releases each outgoing scene across ten 3D to 2D to 3D swaps (CA-8)', async () => {
  const { game } = await ready3dGame()
  const retained = new Set<THREE.RenderTarget>()
  for (let cycle = 0; cycle < 10; cycle++) {
    loadScene(game, scene3d([
      { name: 'Sun', components: [{ type: 'Sun' }] },
      { name: 'Lamp', components: [{ type: 'PointLight' }] },
    ]), registryOf({ Sun, PointLight }))
    renderFrame(game)
    const sun = defined(defined(game.find('Sun')).get(Sun))
    const lamp = defined(defined(game.find('Lamp')).get(PointLight))
    allocateTarget(defined(sun.light), retained)
    allocateTarget(defined(lamp.light), retained)
    expect(retained.size).toBe(2)
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))
    renderFrame(game)
    expect(retained.size).toBe(0)
    expect(game.scene.children.some((object) => object instanceof THREE.Light)).toBe(false)
  }
  game.dispose()
  expect(retained.size).toBe(0)
})
