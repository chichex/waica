// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Collider } from './components/collider.js'
import { Model } from './components/model.js'
import { RigidBody } from './components/rigid-body.js'
import { Sun } from './components/sun.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'

use3dTestEnvironment()

async function simulate(quality: 'off' | 'medium') {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([
    { name: 'Falling', position: [0, 5, 0], components: [{ type: 'Model' }, { type: 'Collider' }, { type: 'RigidBody' }] },
    { name: 'Sun', components: [{ type: 'Sun' }] },
  ], { shadows: { quality } }), registryOf({ Model, Collider, RigidBody, Sun }))
  await game.ready()
  const bridge = runtimeBridgeOf(game)
  bridge.control({ operation: 'step', frames: 30 })
  const snapshot = bridge.inspect()
  game.dispose()
  return { entities: snapshot.entities, physics: snapshot.physics, time: snapshot.time, simulationTime: snapshot.simulationTime }
}

it('keeps transforms, physics and Game Time identical with shadows on and off (CA-10)', async () => {
  const off = await simulate('off')
  const on = await simulate('medium')

  expect(on).toEqual(off)
  expect(on.simulationTime).toBe(0.5)
})
