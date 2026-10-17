import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('loads the results and GPU-evidence validators in native strip-only Node, not only Vite', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    "await import('./src/results-guard.ts'); await import('./src/backend-matrix.ts'); console.log('native validators ready')",
  ], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000 })
  expect(output.trim()).toBe('native validators ready')
})
