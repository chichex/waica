import type * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** What a model backend hands the cache: the glTF's scene graph and its animation clips. */
export interface LoadedModel {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}

/**
 * The seam between `game.assets.model()` and the browser (ADR 0013's move,
 * applied to glTF — ADR 0019). `load` resolves once the file behind `url` is
 * parsed, embedded textures included; it rejects on a load error and never
 * throws synchronously. A test injects `FakeModelBackend`
 * (assets/test-helpers.ts) through `GameOptions.models`.
 */
export interface ModelBackend {
  load(url: string): Promise<LoadedModel>
}

/** What a loader reports (an `ErrorEvent`, a string, an `Error`) as an `Error` naming the file. */
function asError(error: unknown, url: string): Error {
  if (error instanceof Error) return error
  return new Error(`failed to load "${url}"`, { cause: error })
}

/** The real implementation: one `GLTFLoader` per Game, wrapped in a promise. */
export class GltfModelBackend implements ModelBackend {
  private readonly loader = new GLTFLoader()

  load(url: string): Promise<LoadedModel> {
    return new Promise((resolve, reject) => {
      try {
        this.loader.load(
          url,
          (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
          undefined,
          (error) => reject(asError(error, url)),
        )
      } catch (error: unknown) {
        reject(asError(error, url))
      }
    })
  }
}
