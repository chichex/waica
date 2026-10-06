import { describe, expect, it } from 'vitest'
import { describeRenderer } from './renderer-probe.ts'

describe('describeRenderer (review #6)', () => {
  it('describes the WebGPU adapter a webgpu scenario actually drew on', () => {
    const renderer = { backend: { device: { adapterInfo: { vendor: 'apple', architecture: 'metal-3', description: '' } } } }

    expect(describeRenderer('webgpu', renderer, () => 'ANGLE (Apple, Metal)')).toBe('WebGPU: apple metal-3')
  })

  it('keeps the WebGL renderer string for a webgl2 scenario', () => {
    expect(describeRenderer('webgl2', { backend: {} }, () => 'ANGLE (Google, SwiftShader)')).toBe('ANGLE (Google, SwiftShader)')
  })

  it('says so when a webgpu device reports no adapter info', () => {
    expect(describeRenderer('webgpu', { backend: { device: {} } }, () => 'unused')).toBe('WebGPU: unknown adapter')
  })
})
