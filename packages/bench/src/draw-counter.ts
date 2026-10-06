import type { RenderBackend } from '@waica/engine'

/** The slice of three's WebGPURenderer the bench reads. */
export interface BenchRenderer {
  /** three counts every draw it issues, on either backend, in `info.render.drawCalls`. */
  readonly info: { readonly render: { readonly drawCalls: number } }
  /** The backend init() settled on: WebGPU, or the WebGL2 fallback. */
  readonly backend: object
}

export interface RendererCapture {
  /** The renderer whose init() ran last, or null before any. */
  readonly current: BenchRenderer | null
  uninstall(): void
}

type Patchable = object

/**
 * Wraps `init` on a renderer prototype (in the page:
 * `THREE.WebGPURenderer.prototype`) so the bench learns which renderer the
 * Game built, without any engine API. Install it before the Game exists.
 */
export function captureRenderer(prototype: Patchable): RendererCapture {
  let current: BenchRenderer | null = null
  const remember = (renderer: BenchRenderer): void => {
    current = renderer
  }
  const target = prototype as Record<string, unknown>
  const ownDescriptor = Object.getOwnPropertyDescriptor(prototype, 'init')
  const original = target.init
  if (typeof original !== 'function') throw new Error('bench: the renderer prototype has no init()')
  target.init = function capturedInit(this: BenchRenderer, ...args: unknown[]): unknown {
    remember(this)
    return (original as (...a: unknown[]) => unknown).apply(this, args)
  }
  return {
    get current() {
      return current
    },
    uninstall() {
      if (ownDescriptor) Object.defineProperty(prototype, 'init', ownDescriptor)
      else delete target.init
    },
  }
}

/** Draw calls `renderer` issued while `frame` ran: the difference, so an earlier count never leaks in. */
export function countDraws(renderer: BenchRenderer, frame: () => void): number {
  const before = renderer.info.render.drawCalls
  frame()
  return renderer.info.render.drawCalls - before
}

interface WebGPUQueueOwner {
  device: { queue: { onSubmittedWorkDone(): Promise<unknown> } }
}

interface PixelReader {
  readonly RGBA: number
  readonly UNSIGNED_BYTE: number
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, pixels: Uint8Array): void
}

function hasQueue(backend: object): backend is WebGPUQueueOwner {
  const { device } = backend as Partial<WebGPUQueueOwner>
  return typeof device?.queue?.onSubmittedWorkDone === 'function'
}

function hasPixelReader(backend: object): backend is { gl: PixelReader } {
  const { gl } = backend as { gl?: Partial<PixelReader> }
  return typeof gl?.readPixels === 'function'
}

const SYNC_PIXEL = new Uint8Array(4)

/**
 * Waits until the GPU has executed every command issued so far on the
 * Render Backend the Game reports (`game.backend`), so a
 * frame's wall time includes GPU (or SwiftShader) work, not just its CPU
 * submission: on WebGPU the queue reports it, on WebGL2 reading back one
 * pixel forces the pipeline to drain.
 */
export async function syncGpu(renderer: BenchRenderer, renderBackend: RenderBackend): Promise<void> {
  const { backend } = renderer
  if (renderBackend === 'webgpu' && hasQueue(backend)) {
    await backend.device.queue.onSubmittedWorkDone()
    return
  }
  if (renderBackend === 'webgl2' && hasPixelReader(backend)) {
    const { gl } = backend
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, SYNC_PIXEL)
    return
  }
  throw new Error(`bench: no GPU sync for a ${renderBackend} renderer backend`)
}
