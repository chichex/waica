interface TextureLimitReader {
  MAX_TEXTURE_SIZE: number
  getParameter(parameter: number): unknown
}

interface RenderFrameClock {
  frameId: number
  update(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTextureLimitReader(value: unknown): value is TextureLimitReader {
  return isRecord(value) && typeof value.MAX_TEXTURE_SIZE === 'number' && typeof value.getParameter === 'function'
}

function isRenderFrameClock(value: unknown): value is RenderFrameClock {
  return isRecord(value) && typeof value.frameId === 'number' && Number.isFinite(value.frameId) && typeof value.update === 'function'
}

/**
 * Three 0.186 has no public manual-frame pump. Keep this checked compatibility
 * boundary isolated: its RAF frame must not cache shadows/skeletons across
 * several fixed-frame renders. Native RAF updates must never be doubled.
 */
export function advanceRendererFrame(renderer: object, previous: number | null): number {
  const nodes = '_nodes' in renderer ? renderer._nodes : undefined
  const clock = isRecord(nodes) ? nodes.nodeFrame : undefined
  if (!isRenderFrameClock(clock)) throw new Error('3D renderer has no compatible NodeFrame clock (Three 0.186).')
  if (clock.frameId === previous) clock.update()
  return clock.frameId
}

function webgpuLimit(backend: object): unknown {
  const device = 'device' in backend ? backend.device : undefined
  const limits = isRecord(device) ? device.limits : undefined
  return isRecord(limits) ? limits.maxTextureDimension2D : undefined
}

function webglLimit(backend: object): unknown {
  const gl = 'gl' in backend ? backend.gl : undefined
  return isTextureLimitReader(gl) ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : undefined
}

/** Read the initialized backend, never infer device limits from its API name. */
export function shadowTextureLimit(backend: object): number {
  const limit = 'isWebGPUBackend' in backend && backend.isWebGPUBackend === true ? webgpuLimit(backend) : webglLimit(backend)
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : 0
}
