/**
 * The GPU API a Game draws through (CONTEXT.md): `webgpu` when the browser
 * offers it, otherwise three's own WebGL2 fallback. The browser decides; no
 * option forces either one (ADR 0025).
 */
export type RenderBackend = 'webgpu' | 'webgl2'

/** The part of three's WebGPURenderer readiness depends on. */
export interface InitializingRenderer {
  init(): Promise<unknown>
  dispose(): Promise<void>
  /** After init(), the backend it settled on: the WebGPU one, or the WebGL2 fallback. */
  readonly backend: object
}

type ReadinessState =
  | { status: 'pending' }
  | { status: 'ready'; backend: RenderBackend }
  | { status: 'failed' }

/** three flags its WebGPU backend with `isWebGPUBackend`; its WebGL2 fallback has no such flag. */
function backendOf(backend: object): RenderBackend {
  return 'isWebGPUBackend' in backend && backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2'
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * A renderer's asynchronous initialization, owned by its Game: started at
 * construction, settled once, and the only gate between a frame and a draw.
 * `promise` is what `game.ready()` hands out; a failure rejects it with an
 * error naming both Render Backends and is also reported to `onFailure`.
 */
export class RenderReadiness {
  readonly promise: Promise<void>
  private state: ReadinessState = { status: 'pending' }

  constructor(
    private readonly renderer: InitializingRenderer,
    onFailure: (error: Error) => void,
  ) {
    this.promise = renderer.init().then(
      () => {
        this.state = { status: 'ready', backend: backendOf(renderer.backend) }
      },
      (cause: unknown) => {
        this.state = { status: 'failed' }
        const error = new Error(
          `No Render Backend could initialize: neither webgpu nor webgl2 is available (${describeCause(cause)}).`,
          { cause },
        )
        onFailure(error)
        throw error
      },
    )
    // The rejection belongs to whoever awaits game.ready(); a Game nobody
    // asked must not surface it as an unhandled rejection on top of that.
    this.promise.catch(() => {})
  }

  /** True once the renderer can draw. */
  get isReady(): boolean {
    return this.state.status === 'ready'
  }

  /** The Render Backend after a successful init; null before it and after a failure. */
  get backend(): RenderBackend | null {
    return this.state.status === 'ready' ? this.state.backend : null
  }

  /**
   * Frees the renderer: right away once it is ready, after init settles
   * while it is pending (three cannot dispose a renderer mid-init), never
   * after a failed init (nothing was allocated).
   */
  disposeRenderer(): void {
    const dispose = (): void => {
      this.renderer.dispose().catch((error: unknown) => {
        console.error('[waica] could not dispose the renderer', error)
      })
    }
    if (this.isReady) {
      dispose()
      return
    }
    this.promise.then(dispose, () => {})
  }
}
