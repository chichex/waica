import { expect, it } from 'vitest'
import { THREE } from './index'

it('re-exports the three/webgpu build as THREE: WebGPURenderer, no WebGLRenderer (ADR 0025)', () => {
  expect(typeof THREE.WebGPURenderer).toBe('function')
  expect((THREE as Record<string, unknown>).WebGLRenderer).toBeUndefined()
})
