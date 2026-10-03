import * as THREE from 'three/webgpu'

/**
 * The seam between `game.assets` and the browser (ADR 0013's move, applied
 * to textures — ADR 0019). `load` resolves once the image behind `url` is
 * decoded, with a texture whose `image` the loader adopts into its own
 * cached base; it rejects on a load error and never throws synchronously.
 * `happy-dom` decodes no images, so a test injects `FakeTextureBackend`
 * (assets/test-helpers.ts) through `GameOptions.textures`.
 */
export interface TextureBackend {
  load(url: string): Promise<THREE.Texture>
}

/** The real implementation: one `THREE.TextureLoader` per Game, wrapped in a promise. */
export class ThreeTextureBackend implements TextureBackend {
  private readonly loader = new THREE.TextureLoader()

  load(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      try {
        this.loader.load(url, resolve, undefined, reject)
      } catch (error: unknown) {
        reject(error)
      }
    })
  }
}
