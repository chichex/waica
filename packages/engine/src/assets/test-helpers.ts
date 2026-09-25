import * as THREE from 'three'
import type { TextureBackend } from './texture-backend.js'

interface PixelSize {
  width: number
  height: number
}

interface Gate {
  promise: Promise<void>
  open(): void
}

function gate(): Gate {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/**
 * Records exactly what the real ThreeTextureBackend would receive (ADR 0013,
 * ADR 0019). `load` resolves with a texture whose image is a plain
 * `{ width, height }` — 64×64 unless `imageSize(url, …)` says otherwise, so
 * a Tilemap can rebuild its geometry from it — rejects for a url given to
 * `failUrl`, and stays unsettled for a url given to `hold` until
 * `release(url)`, so `pending` is observable mid-flight.
 */
export class FakeTextureBackend implements TextureBackend {
  /** Every url the loader asked for, in order — one per distinct url when the cache works. */
  readonly loadCalls: string[] = []
  private readonly failing = new Set<string>()
  private readonly sizes = new Map<string, PixelSize>()
  private readonly gates = new Map<string, Gate>()

  /** Makes a subsequent load() of this url reject, as if the image 404'd or failed to decode. */
  failUrl(url: string): void {
    this.failing.add(url)
  }

  /** Sets the pixel size of the image a subsequent load() of this url resolves with. */
  imageSize(url: string, width: number, height: number): void {
    this.sizes.set(url, { width, height })
  }

  /** Keeps a subsequent load() of this url unsettled until release(url). */
  hold(url: string): void {
    if (!this.gates.has(url)) this.gates.set(url, gate())
  }

  /** Lets a held url settle (resolve, or reject if it was also given to failUrl). */
  release(url: string): void {
    const held = this.gates.get(url)
    if (!held) return
    this.gates.delete(url)
    held.open()
  }

  async load(url: string): Promise<THREE.Texture> {
    this.loadCalls.push(url)
    const held = this.gates.get(url)
    if (held) await held.promise
    if (this.failing.has(url)) throw new Error(`fake texture backend: "${url}" is configured to fail`)
    const size = this.sizes.get(url) ?? { width: 64, height: 64 }
    const texture = new THREE.Texture()
    texture.image = { width: size.width, height: size.height } as HTMLImageElement
    return texture
  }
}

/** Waits one macrotask, past every microtask the loader and its consumers chain. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
