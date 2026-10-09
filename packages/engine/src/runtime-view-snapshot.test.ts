// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { FakeTextureBackend } from './assets/test-helpers.js'
import { Game } from './game.js'
import { RUNTIME_BRIDGE_SYMBOL, type RuntimeBridge, type RuntimeBridgeActivation } from './runtime-bridge.js'
import { loadScene, type SceneJson } from './scene.js'
import { REGISTRY, useSpriteBatchTestEnvironment } from './test-sprite-batches.js'
import { defined } from './test-support.js'

useSpriteBatchTestEnvironment()

function bridgeOf(game: Game): RuntimeBridge {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  game.start()
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  return defined(registered[0])
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas, textures: new FakeTextureBackend(), viewHeight: 10 })
}

const SCENE_3D: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 1, 0], fov: 50 },
  entities: [],
}

describe('Runtime Snapshot space and view (CA-16)', () => {
  it('reports a 2d scene as orthographic: position and zoom', () => {
    const game = makeGame()
    loadScene(game, { waicaScene: 3, camera: { position: [3, 4], zoom: 12 }, entities: [] }, REGISTRY)
    const snapshot = bridgeOf(game).inspect({})
    expect(snapshot.space).toBe('2d')
    expect(snapshot.view).toEqual({ kind: 'orthographic', position: [3, 4], zoom: 12 })
    expect(snapshot.camera.shake).toBeDefined()
  })

  it('reports no scene as a 2d orthographic view of the Game', () => {
    const game = makeGame()
    expect(bridgeOf(game).inspect({})).toMatchObject({ space: '2d', view: { kind: 'orthographic', position: [0, 0], zoom: 10 } })
  })

  it('reports a 3d scene with its perspective pose: position, target and fov', () => {
    const game = makeGame()
    loadScene(game, SCENE_3D, REGISTRY)
    const snapshot = bridgeOf(game).inspect({})
    expect(snapshot.space).toBe('3d')
    expect(snapshot.view).toEqual({ kind: 'perspective', position: [0, 4, 12], target: [0, 1, 0], fov: 50 })
  })

  it('follows a camera that game code moves: the position is the live one', () => {
    const game = makeGame()
    loadScene(game, SCENE_3D, REGISTRY)
    game.camera.position.x = 5
    const view = bridgeOf(game).inspect({}).view
    expect(view).toMatchObject({ kind: 'perspective', position: [5, 4, 12] })
  })
})
