// Test support, shared by every package's tests and excluded from builds.
// happy-dom hosts no GPU, so a test replaces three's WebGPURenderer with this
// fake. Inside the engine:
//
//   vi.mock('three/webgpu', async (importOriginal) =>
//     (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()))
//
// Another package mocks the engine's own copy of three the same way, by its
// path: `<engine>/node_modules/three/build/three.webgpu.js`. Like the real
// renderer, the fake draws nothing (and throws) before its `init()` settled.

/** How the next renderer's `init()` settles: on a Render Backend, never on its own, or with an error. */
export type FakeRendererInit = 'webgpu' | 'webgl2' | 'pending' | Error

interface FakeCamera {
  position: { x: number; y: number }
}

/** What every fake renderer reads and records; reset between tests with resetFakeRendering(). */
export const fakeRendering = {
  init: 'webgpu' as FakeRendererInit,
  /** Every renderer built since the last reset, in construction order. */
  renderers: [] as FakeWebGPURenderer[],
  /** Called on every render with the scene and camera as three would draw them. */
  onRender: null as ((scene: unknown, camera: FakeCamera) => void) | null,
}

export function resetFakeRendering(): void {
  fakeRendering.init = 'webgpu'
  fakeRendering.renderers.length = 0
  fakeRendering.onRender = null
}

/** The renderer built last, failing the test when there is none. */
export function lastFakeRenderer(): FakeWebGPURenderer {
  const renderer = fakeRendering.renderers.at(-1)
  if (!renderer) throw new Error('no fake WebGPURenderer was built')
  return renderer
}

export class FakeWebGPURenderer {
  readonly domElement: HTMLCanvasElement
  /** Mirrors the real backend flag, read after init(). */
  readonly backend = { isWebGPUBackend: false }
  readonly info = { render: { drawCalls: 0 } }
  /** three's switch for a model view computed on the CPU instead of in the shader. */
  highPrecision = false
  /** The animation loop callback last installed, or null. */
  loop: ((time: number) => void) | null = null
  renders = 0
  disposed = false
  private initialized = false
  private initPromise: Promise<this> | null = null
  private settleInit: (() => void) | null = null
  private failInit: ((error: Error) => void) | null = null
  private readonly initMode: FakeRendererInit

  constructor({ canvas }: { canvas: HTMLCanvasElement }) {
    this.domElement = canvas
    this.initMode = fakeRendering.init
    fakeRendering.renderers.push(this)
  }

  init(): Promise<this> {
    this.initPromise ??= new Promise<this>((resolve, reject) => {
      this.settleInit = () => resolve(this)
      this.failInit = reject
      const mode = this.initMode
      if (mode instanceof Error) reject(mode)
      else if (mode !== 'pending') this.resolveInit(mode)
    })
    return this.initPromise
  }

  /** Settles a 'pending' init() on `backend`. */
  resolveInit(backend: 'webgpu' | 'webgl2'): void {
    this.backend.isWebGPUBackend = backend === 'webgpu'
    this.initialized = true
    this.settleInit?.()
  }

  /** Fails a 'pending' init(). */
  rejectInit(error: Error): void {
    this.failInit?.(error)
  }

  setPixelRatio(): void {}
  setSize(): void {}
  setViewport(): void {}
  setScissor(): void {}
  setScissorTest(): void {}
  setClearColor(): void {}

  clear(): void {
    this.assertInitialized('clear')
  }

  render(scene: unknown, camera: FakeCamera): void {
    this.assertInitialized('render')
    this.renders += 1
    fakeRendering.onRender?.(scene, camera)
  }

  setAnimationLoop(loop: ((time: number) => void) | null): Promise<void> {
    this.loop = loop
    return Promise.resolve()
  }

  dispose(): Promise<void> {
    this.disposed = true
    return Promise.resolve()
  }

  private assertInitialized(method: string): void {
    if (!this.initialized) throw new Error(`THREE.Renderer: .${method}() called before the backend is initialized.`)
  }
}

/** `three/webgpu` with the fake in place of WebGPURenderer, for a vi.mock factory. */
export function withFakeRenderer(actual: Record<string, unknown>): Record<string, unknown> {
  return { ...actual, WebGPURenderer: FakeWebGPURenderer }
}
