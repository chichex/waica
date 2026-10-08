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
  layers?: { mask: number }
}

/** One render call as the fake saw it: what was drawn, into which target, with which camera layers and clearing. */
export interface FakeDraw {
  scene: unknown
  camera: FakeCamera
  /** The bound render target, null for the canvas. */
  target: unknown
  /** The camera's layer mask at the call; null for a camera without layers. */
  layers: number | null
  autoClear: boolean
  /** The drawn object's `background` at the call (a Scene's), or undefined. */
  background: unknown
}

/** What a scene or quad drawn by the fake may carry. */
interface FakeDrawable {
  background?: unknown
}

/** What every fake renderer reads and records; reset between tests with resetFakeRendering(). */
export const fakeRendering = {
  init: 'webgpu' as FakeRendererInit,
  /** Every renderer built since the last reset, in construction order. */
  renderers: [] as FakeWebGPURenderer[],
  /** Called on every render with the scene and camera as three would draw them. */
  onRender: null as ((scene: unknown, camera: FakeCamera) => void) | null,
  /**
   * Canvases whose context a disposed renderer lost: three's WebGL2 backend
   * calls WEBGL_lose_context.loseContext() in dispose(), and a canvas hands
   * every renderer the same context, so another renderer on that canvas is
   * left without one.
   */
  lostCanvases: new Set<HTMLCanvasElement>(),
  /** Every render call since the last reset, in call order. */
  draws: [] as FakeDraw[],
  /** Every `THREE.RenderTarget` constructed since the last reset. */
  renderTargets: [] as unknown[],
}

export function resetFakeRendering(): void {
  fakeRendering.init = 'webgpu'
  fakeRendering.renderers.length = 0
  fakeRendering.onRender = null
  fakeRendering.lostCanvases.clear()
  fakeRendering.draws.length = 0
  fakeRendering.renderTargets.length = 0
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
  /** three's default output: sRGB, through an intermediate linear target. */
  outputColorSpace = 'srgb'
  /** The renderer-wide context three merges into every material build. */
  readonly contextNode = { value: {} as Record<string, unknown> }
  /** three's switch for clearing before every render. */
  autoClear = true
  /** The bound render target; null draws to the canvas. */
  renderTarget: unknown = null
  /** What setClearColor last received, and its alpha. */
  clearColor: unknown = 0x000000
  clearAlpha = 1
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

  private pixelRatio = 1
  private width = 0
  private height = 0

  setPixelRatio(value: number): void {
    this.pixelRatio = value
  }

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  /** The canvas size times the pixel ratio, as three reports it. */
  getDrawingBufferSize<T extends { set(x: number, y: number): T }>(target: T): T {
    return target.set(Math.floor(this.width * this.pixelRatio), Math.floor(this.height * this.pixelRatio))
  }

  setRenderTarget(target: unknown): void {
    this.renderTarget = target ?? null
  }

  getRenderTarget(): unknown {
    return this.renderTarget
  }

  getClearColor<T extends { set(value: unknown): T }>(target: T): T {
    return target.set(this.clearColor)
  }

  getClearAlpha(): number {
    return this.clearAlpha
  }
  setViewport(): void {}
  setScissor(): void {}
  setScissorTest(): void {}
  setClearColor(color: unknown, alpha = 1): void {
    this.clearColor = color
    this.clearAlpha = alpha
  }

  clear(): void {
    this.assertInitialized('clear')
  }

  render(scene: FakeDrawable, camera: FakeCamera): void {
    this.assertInitialized('render')
    this.renders += 1
    fakeRendering.draws.push({
      scene,
      camera,
      target: this.renderTarget,
      layers: camera.layers?.mask ?? null,
      autoClear: this.autoClear,
      background: scene.background,
    })
    fakeRendering.onRender?.(scene, camera)
  }

  /** Like three: applied at once when initialized, otherwise once init() settled, in call order. */
  setAnimationLoop(loop: ((time: number) => void) | null): Promise<void> {
    if (this.initialized) {
      this.loop = loop
      return Promise.resolve()
    }
    return this.init().then(() => {
      this.loop = loop
    })
  }

  dispose(): Promise<void> {
    this.disposed = true
    fakeRendering.lostCanvases.add(this.domElement)
    return Promise.resolve()
  }

  private assertInitialized(method: string): void {
    if (!this.initialized) throw new Error(`THREE.Renderer: .${method}() called before the backend is initialized.`)
  }
}

/** A constructor three's module exports, as far as a Proxy needs to know. */
function isConstructor(value: unknown): value is new (...args: unknown[]) => object {
  return typeof value === 'function'
}

/** three's RenderTarget, recording every instance in `fakeRendering.renderTargets`. */
function countingRenderTarget(actual: Record<string, unknown>): unknown {
  const RenderTarget = actual.RenderTarget
  if (!isConstructor(RenderTarget)) return RenderTarget
  return new Proxy(RenderTarget, {
    construct(target, args, newTarget) {
      const created: unknown = Reflect.construct(target, args, newTarget)
      if (typeof created !== 'object' || created === null) throw new Error('RenderTarget built no object')
      fakeRendering.renderTargets.push(created)
      return created
    },
  })
}

/** `three/webgpu` with the fake in place of WebGPURenderer, for a vi.mock factory. */
export function withFakeRenderer(actual: Record<string, unknown>): Record<string, unknown> {
  return { ...actual, WebGPURenderer: FakeWebGPURenderer, RenderTarget: countingRenderTarget(actual) }
}
