// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Collider } from './components/collider.js'
import { RigidBody } from './components/rigid-body.js'
import type { Game } from './game.js'
import type { RuntimeBridge } from './runtime-bridge.js'
import { loadScene, type SceneEntityJson } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { defined } from './test-support.js'

// Issue #181 CA-9: a ray from the look point toward the camera pulls the camera in front of what blocks it.

use3dTestEnvironment()

/** The followed Player: a kinematic capsule around the look point, which the ray must ignore. */
const PLAYER: SceneEntityJson = {
  name: 'Player',
  position: [0, 0, 0],
  components: [
    { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8, offset: [0, 0.9, 0] } },
    { type: 'RigidBody', props: { type: 'kinematic' } },
  ],
}

/** A fixed box whose near face (toward the look point) is at z = `face`. */
function wall(name: string, face: number, sensor = false): SceneEntityJson {
  return {
    name,
    position: [0, 1, face + 0.25],
    components: [{ type: 'Collider', props: { shape: 'box', size: [6, 6, 0.5], sensor } }],
  }
}

async function behind(entities: SceneEntityJson[]): Promise<{ game: Game; bridge: RuntimeBridge }> {
  const { game } = await ready3dGame()
  const bridge = runtimeBridgeOf(game)
  const camera = { kind: 'perspective' as const, follow: 'Player', yaw: 0, pitch: 0, distance: 6, lookHeight: 1 }
  // No gravity: the kinematic Player stays put, so the look point is exactly (0, 1, 0).
  const scene = { ...scene3d([PLAYER, ...entities], {}, camera), simulation: { gravity: [0, 0, 0] as [number, number, number] } }
  loadScene(game, scene, registryOf({ Collider, RigidBody }))
  await game.assets.ready()
  bridge.control({ operation: 'step' })
  return { game, bridge }
}

function view(bridge: RuntimeBridge): Record<string, unknown> {
  return { ...bridge.inspect().view }
}

it('places the camera at the hit distance minus 0.2, keeping the chosen distance (CA-9)', async () => {
  const { game, bridge } = await behind([wall('Wall', 2.75)])

  expect(view(bridge).distance).toBe(6)
  expect(view(bridge).distanceActual).toBeCloseTo(2.55, 4)
  expect(game.camera.position.z).toBeCloseTo(2.55, 4)
  expect(game.camera.position.y).toBeCloseTo(1, 6)
})

it('springs back to the chosen distance once the wall is gone (CA-9)', async () => {
  const { game, bridge } = await behind([wall('Wall', 2.75)])

  defined(game.find('Wall')).destroy()
  bridge.control({ operation: 'step' })

  expect(view(bridge)).toMatchObject({ distance: 6, distanceActual: 6 })
  expect(game.camera.position.z).toBeCloseTo(6, 6)
})

it('never comes closer than 0.5 to the look point (CA-9)', async () => {
  const { bridge } = await behind([wall('Close', 0.45)])

  expect(view(bridge).distanceActual).toBe(0.5)
})

it('ignores the followed entity’s own colliders and sensors (CA-9)', async () => {
  const { bridge } = await behind([wall('Trigger', 2, true)])

  expect(view(bridge)).toMatchObject({ distance: 6, distanceActual: 6 })
})
