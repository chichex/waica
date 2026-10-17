import { expect, it } from 'vitest'
import { activeWebglRenderer } from './renderer-probe.ts'

it('describes the context actually used, not a second browser-selected context', () => {
  const gl = {
    RENDERER: 1,
    getExtension: (name: string) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 2 } : null,
    getParameter: (parameter: number) => parameter === 2 ? 'Actual GPU' : 'Masked GPU',
  }
  expect(activeWebglRenderer({ gl })).toBe('Actual GPU')
  expect(activeWebglRenderer({ gl: { ...gl, getExtension: () => null } })).toBe('Masked GPU')
  expect(() => activeWebglRenderer({})).toThrow(/actual WebGL2 context/)
})
