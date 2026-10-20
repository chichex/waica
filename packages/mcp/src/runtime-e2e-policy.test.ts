import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function selection(args: readonly string[]): unknown {
  const script = `
    import { runtimeE2eLegOptions } from './scripts/runtime-e2e-policy.mjs';
    import { RENDER_BACKEND_LEGS } from './scripts/runtime-e2e.mjs';
    console.log(JSON.stringify(RENDER_BACKEND_LEGS.map(({backend}) => ({backend,...runtimeE2eLegOptions(backend,${JSON.stringify(args)})}))));
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  }))
}

it('keeps both legacy backend legs but requires new shadow pixels only on WebGL2 by default', () => {
  expect(selection([])).toEqual([
    { backend: 'webgl2', includeShadows: true, includeEditorShadows: true },
    { backend: 'webgpu', includeShadows: false, includeEditorShadows: false },
  ])
})

it('explicitly enables the unchanged strict WebGPU shadow runtime and editor oracles on demand', () => {
  expect(selection(['--webgpu-shadows'])).toEqual([
    { backend: 'webgl2', includeShadows: true, includeEditorShadows: true },
    { backend: 'webgpu', includeShadows: true, includeEditorShadows: true },
  ])
})

it('accepts a leading pnpm argument separator without changing either backend leg', () => {
  expect(selection(['--'])).toEqual(selection([]))
  expect(selection(['--', '--webgpu-shadows'])).toEqual([
    { backend: 'webgl2', includeShadows: true, includeEditorShadows: true },
    { backend: 'webgpu', includeShadows: true, includeEditorShadows: true },
  ])
})

it('rejects mistyped requests instead of silently omitting the manual coverage', () => {
  expect(() => selection(['--webgpu-shadow'])).toThrow(/unknown runtime e2e argument/)
})

it.each([
  ['--', '--webgpu-shadow'],
  ['--webgpu-shadows', '--'],
  ['--', '--'],
  ['--', '--webgpu-shadows', '--unknown'],
])('rejects unknown arguments or separators outside the leading position: %j', (...args) => {
  expect(() => selection(args)).toThrow(/unknown runtime e2e argument/)
})
