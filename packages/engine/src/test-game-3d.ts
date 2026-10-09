// Test support for the 3D tests, excluded from builds. The test files mock
// three's WebGPURenderer with test-renderer.ts; this only builds a Game over
// a sized canvas with the fake texture and model backends, and 3D scenes.
import * as THREE from 'three/webgpu'
import { FakeModelBackend, FakeTextureBackend } from './assets/test-helpers.js'
import type { SceneCameraJson } from './camera.js'
import { Game, type GameOptions, type GameResolution } from './game.js'
import { loadRapier } from './physics-3d/rapier-module.js'
import { RUNTIME_BRIDGE_SYMBOL, type RuntimeBridge, type RuntimeBridgeActivation } from './runtime-bridge.js'
import type { SceneEntityJson, SceneJson, SceneRegistry, SceneRenderJson } from './scene.js'
import { useSpriteBatchTestEnvironment, type AnyMesh } from './test-sprite-batches.js'

export interface Game3d {
  game: Game
  models: FakeModelBackend
  textures: FakeTextureBackend
}

/** A Game on a 640×360 canvas whose renderer is ready, with fake backends for textures and glTF and the real Rapier. */
export async function ready3dGame(
  size = { width: 640, height: 360 },
  resolution?: GameResolution,
  extra: Partial<GameOptions> = {},
): Promise<Game3d> {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: size.width }, clientHeight: { value: size.height } })
  document.body.append(canvas)
  const models = new FakeModelBackend()
  const textures = new FakeTextureBackend()
  // The real deterministic Rapier through the GameOptions.physics seam, initialized once per file (issue #159 inference 6).
  const game = new Game({ canvas, models, textures, physics: loadRapier, ...(resolution ? { resolution } : {}), ...extra })
  await game.ready()
  return { game, models, textures }
}

export const CAMERA_3D: SceneCameraJson = { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 }

/** A 3D scene with the given entities, render options and camera (a camera at (0, 0, 10) looking at the origin by default). */
export function scene3d(
  entities: SceneEntityJson[],
  render: SceneRenderJson = {},
  camera: SceneCameraJson = CAMERA_3D,
): SceneJson {
  return { waicaScene: 3, render: { space: '3d', ...render }, camera, entities }
}

/** A registry of the given components, resolving `waica:<name>` uris to `/assets/<name>` as an archetype would. */
export function registryOf(components: SceneRegistry['components']): SceneRegistry {
  return {
    components,
    resolveAsset: (uri) => (uri.startsWith('waica:') ? `/assets/${uri.slice('waica:'.length)}` : uri),
  }
}

function isAnyMesh(object: THREE.Object3D): object is AnyMesh {
  return object instanceof THREE.Mesh
}

/** Every mesh under `root`, typed for what a glTF or a primitive gives them (the generics three leaves at `any`). */
export function meshesUnder(root: THREE.Object3D): AnyMesh[] {
  const found: AnyMesh[] = []
  root.traverse((object) => {
    if (isAnyMesh(object)) found.push(object)
  })
  return found
}

/** A clean DOM, a ResizeObserver stub and no render hook around every 3D test. */
export function use3dTestEnvironment(): void {
  useSpriteBatchTestEnvironment()
}

/** The Runtime Bridge a started Game registers with a host activation: the surface `inspect_runtime` reads. */
export function runtimeBridgeOf(game: Game): RuntimeBridge {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  game.start()
  Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL)
  const bridge = registered[0]
  if (!bridge) throw new Error('the Game registered no Runtime Bridge')
  return bridge
}
