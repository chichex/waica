interface TextureLimitReader {
  MAX_TEXTURE_SIZE: number
  getParameter(parameter: number): unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTextureLimitReader(value: unknown): value is TextureLimitReader {
  return isRecord(value) && typeof value.MAX_TEXTURE_SIZE === 'number' && typeof value.getParameter === 'function'
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
