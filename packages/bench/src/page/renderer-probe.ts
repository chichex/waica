import type { RenderBackend } from '@waica/engine'

interface RendererContext {
  readonly RENDERER: number
  getExtension(name: string): unknown
  getParameter(parameter: number): unknown
}

function isRendererContext(value: unknown): value is RendererContext {
  return typeof value === 'object' && value !== null && 'RENDERER' in value && typeof value.RENDERER === 'number'
    && 'getExtension' in value && typeof value.getExtension === 'function'
    && 'getParameter' in value && typeof value.getParameter === 'function'
}

/** Never create a second context to identify the device that performed this run. */
export function activeWebglRenderer(backend: object): string {
  const gl = 'gl' in backend ? backend.gl : undefined
  if (!isRendererContext(gl)) throw new Error('bench: actual WebGL2 context unavailable')
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const parameter = typeof info === 'object' && info !== null && 'UNMASKED_RENDERER_WEBGL' in info
    && typeof info.UNMASKED_RENDERER_WEBGL === 'number' ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER
  const value = gl.getParameter(parameter)
  if (typeof value !== 'string' || !value) throw new Error('bench: actual renderer identity unavailable')
  return value
}

/**
 * The WebGL renderer string of this browser — a GPU model, or a software
 * renderer such as SwiftShader — read from a throwaway WebGL2 context. The
 * unmasked string needs WEBGL_debug_renderer_info; without it, the masked
 * `RENDERER` is the best available.
 */
export function webglRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) return 'unavailable'
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const value: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return typeof value === 'string' ? value : 'unknown'
}

interface AdapterInfo {
  readonly vendor?: string
  readonly architecture?: string
  readonly description?: string
}

/**
 * What a scenario drew on, for reading its timings: on WebGPU the adapter of
 * the very device the renderer used; on WebGL2 the WebGL renderer string
 * (`webgl`, normally `webglRenderer`).
 */
export function describeRenderer(
  backend: RenderBackend,
  renderer: { readonly backend: object },
  webgl: () => string,
): string {
  if (backend === 'webgl2') return webgl()
  const { device } = renderer.backend as { device?: { adapterInfo?: AdapterInfo } }
  const info = device?.adapterInfo
  const parts = [info?.vendor, info?.architecture, info?.description].filter((part) => part !== undefined && part !== '')
  return `WebGPU: ${parts.length > 0 ? parts.join(' ') : 'unknown adapter'}`
}
