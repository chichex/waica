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
