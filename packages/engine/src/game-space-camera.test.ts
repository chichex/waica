// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { listenerPosition } from './audio/spatial.js'
import { FakeTextureBackend } from './assets/test-helpers.js'
import type { SceneCameraJson } from './camera.js'
import { Component } from './component.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { Game } from './game.js'
import { RUNTIME_BRIDGE_SYMBOL, type RuntimeBridge, type RuntimeBridgeActivation } from './runtime-bridge.js'
import { loadScene, type SceneJson } from './scene.js'
import { REGISTRY, useSpriteBatchTestEnvironment } from './test-sprite-batches.js'
import { defined } from './test-support.js'

useSpriteBatchTestEnvironment()

const PERSPECTIVE: SceneCameraJson = { kind: 'perspective', position: [0, 4, 12], target: [0, 1, 0], fov: 50 }

async function readyGame(): Promise<Game> {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({ canvas, textures: new FakeTextureBackend(), viewHeight: 10 })
  await game.ready()
  return game
}

function scene3d(entities: SceneJson['entities'] = [], camera: SceneCameraJson | undefined = PERSPECTIVE): SceneJson {
  return { waicaScene: 3, render: { space: '3d' }, ...(camera ? { camera } : {}), entities }
}

/** Records what `game.camera` was while the component mounted. */
class CameraProbe extends Component {
  static override componentName = 'CameraProbe'
  static seen: unknown[] = []
  override onReady(): void {
    CameraProbe.seen.push(this.game.camera)
  }
}

describe('the perspective camera before the spawns of a 3d scene', () => {
  it('is game.camera while the entities run onReady, and stays the same camera after', async () => {
    const game = await readyGame()
    CameraProbe.seen = []
    loadScene(game, scene3d([{ name: 'Probe', components: [{ type: 'CameraProbe' }] }]), { components: { CameraProbe } })
    expect(CameraProbe.seen).toHaveLength(1)
    expect(CameraProbe.seen[0]).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(CameraProbe.seen[0]).toBe(game.camera)
  })

  it('places the camera from the block before the spawns, not at the defaults', async () => {
    const game = await readyGame()
    let position: number[] = []
    class PositionProbe extends Component {
      static override componentName = 'PositionProbe'
      override onReady(): void {
        position = this.game.camera.position.toArray()
      }
    }
    loadScene(game, scene3d([{ name: 'Probe', components: [{ type: 'PositionProbe' }] }]), { components: { PositionProbe } })
    expect(position).toEqual([0, 4, 12])
  })

  it('keeps the orthographic camera for a 2d scene whose entities run onReady', async () => {
    const game = await readyGame()
    CameraProbe.seen = []
    loadScene(
      game,
      { waicaScene: 3, entities: [{ name: 'Probe', components: [{ type: 'CameraProbe' }] }] },
      { components: { CameraProbe } },
    )
    expect(CameraProbe.seen[0]).toBeInstanceOf(THREE.OrthographicCamera)
  })
})

describe('the perspective camera and the Emissive layer', () => {
  it('sees EMISSIVE_LAYER like the orthographic camera, so an Emissive drawable is not hidden', async () => {
    const game = await readyGame()
    const ortho = game.camera
    expect(ortho.layers.isEnabled(EMISSIVE_LAYER)).toBe(true)
    loadScene(game, scene3d(), REGISTRY)
    expect(game.camera).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(game.camera.layers.isEnabled(EMISSIVE_LAYER)).toBe(true)
    expect(game.camera.layers.isEnabled(0)).toBe(true)
  })
})

describe('the audio listener in a 3d scene', () => {
  it('is a copy of the camera position that keeps z, not the live Vector3', async () => {
    const game = await readyGame()
    loadScene(game, scene3d(), REGISTRY)
    const listener = listenerPosition(game.space, game.camera, game.projection)
    expect(listener).toEqual({ x: 0, y: 4, z: 12 })
    expect(listener).not.toBe(game.camera.position)
    game.camera.position.x = 9
    expect(listener.x).toBe(0)
  })

  it('has no z in a 2d scene', async () => {
    const game = await readyGame()
    loadScene(game, { waicaScene: 3, entities: [] }, REGISTRY)
    const listener = listenerPosition(game.space, game.camera, game.projection)
    expect(listener.z).toBeUndefined()
  })
})

function inspectOf(game: Game) {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  game.start()
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  return defined(registered[0]).inspect({})
}

describe('Camera Effects shake in a 3d scene (spec decision 24)', () => {
  it('reports zero shake in the snapshot, since nothing moves', async () => {
    const game = await readyGame()
    loadScene(game, scene3d(), REGISTRY)
    game.cameraEffects.shake({ intensity: 2, seconds: 1 })
    for (let step = 0; step < 3; step += 1) (game as unknown as { runFrame(steps: number): void }).runFrame(1)
    expect(game.cameraEffects.state.shake).not.toEqual({ x: 0, y: 0 })
    expect(inspectOf(game).camera.shake).toEqual({ x: 0, y: 0 })
  })

  it('still reports the shake offset in a 2d scene', async () => {
    const game = await readyGame()
    loadScene(game, { waicaScene: 3, entities: [] }, REGISTRY)
    game.cameraEffects.shake({ intensity: 2, seconds: 1 })
    for (let step = 0; step < 3; step += 1) (game as unknown as { runFrame(steps: number): void }).runFrame(1)
    expect(inspectOf(game).camera.shake).toEqual(game.cameraEffects.state.shake)
  })
})
