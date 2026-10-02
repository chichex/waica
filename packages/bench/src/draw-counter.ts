/**
 * The WebGL calls that issue a draw. three r186 draws through these under
 * WebGL2 (instanced ones for InstancedMesh); the multi-draw extension used
 * by BatchedMesh is not wrapped because no engine renderable uses it.
 */
export const DRAW_ENTRY_POINTS = [
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
] as const

export interface DrawCounter {
  /** Draw calls since install or the last reset(). */
  readonly calls: number
  /** The context that issued the most recent draw, or null before any. */
  readonly lastContext: object | null
  reset(): void
  uninstall(): void
}

type Patchable = object

/**
 * Wraps the draw entry points of each prototype (in the page:
 * `WebGLRenderingContext.prototype` and `WebGL2RenderingContext.prototype`)
 * so every draw is counted, without any engine API.
 */
export function installDrawCounter(prototypes: readonly Patchable[]): DrawCounter {
  let calls = 0
  let lastContext: object | null = null
  const remember = (context: object): void => {
    lastContext = context
  }
  const restores: (() => void)[] = []
  for (const proto of prototypes) {
    const target = proto as Record<string, unknown>
    for (const name of DRAW_ENTRY_POINTS) {
      const original = target[name]
      if (typeof original !== 'function') continue
      target[name] = function countedDraw(this: object, ...args: unknown[]): unknown {
        calls++
        remember(this)
        return (original as (...a: unknown[]) => unknown).apply(this, args)
      }
      restores.push(() => {
        target[name] = original
      })
    }
  }
  return {
    get calls() {
      return calls
    },
    get lastContext() {
      return lastContext
    },
    reset() {
      calls = 0
    },
    uninstall() {
      for (const restore of restores) restore()
      restores.length = 0
    },
  }
}

/** The slice of a WebGL context syncGpu needs. */
export interface PixelReader {
  readonly RGBA: number
  readonly UNSIGNED_BYTE: number
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, pixels: Uint8Array): void
}

const SYNC_PIXEL = new Uint8Array(4)

/**
 * Blocks until the GPU has executed every command issued so far on
 * `context`: reading back one pixel forces the pipeline to drain, so a
 * frame's wall time includes GPU (or SwiftShader) work, not just its CPU
 * submission.
 */
export function syncGpu(context: unknown): void {
  if (!isPixelReader(context)) return
  context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, SYNC_PIXEL)
}

function isPixelReader(value: unknown): value is PixelReader {
  return typeof value === 'object' && value !== null && typeof (value as Partial<PixelReader>).readPixels === 'function'
}
