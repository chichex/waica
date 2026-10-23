import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
// Measured on the shipped WebGL2 demo at frame 13, not a replacement for browser coverage.
const LIT = { shippedPool: [157, 132, 119, 255], shippedControl: [126, 120, 118, 255] }
const DARK = { shippedPool: [123, 117, 115, 255], shippedControl: [126, 120, 118, 255] }

function contribution(lit = LIT, dark = DARK): unknown {
  const script = `
    import { assertShippedTorchContribution } from './scripts/runtime-e2e-third-person.mjs';
    console.log(JSON.stringify(assertShippedTorchContribution(${JSON.stringify(lit)},${JSON.stringify(dark)})));
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  }))
}

it('accepts the actual shipped-demo torch contribution through native Node', () => {
  expect(contribution()).toEqual({ warmthGain: 30, brightnessGain: 53, controlDelta: 0 })
})

it.each([
  ['identical images', LIT, LIT, 'must warm'],
  ['no torch contribution', DARK, DARK, 'must warm'],
  ['brighter but not warmer', { ...LIT, shippedPool: [160, 160, 160, 255] }, DARK, 'must warm'],
  ['warmer but not brighter', { ...LIT, shippedPool: [149, 91, 111, 255] }, DARK, 'must brighten'],
  ['changed distant control', { ...LIT, shippedControl: [130, 120, 118, 255] }, DARK, 'beyond their reach'],
] as const)('rejects %s without relaxing the shipped-scene oracle', (...args) => {
  const [, lit, dark, message] = args
  expect(() => contribution({ shippedPool: [...lit.shippedPool], shippedControl: [...lit.shippedControl] }, {
    shippedPool: [...dark.shippedPool], shippedControl: [...dark.shippedControl],
  })).toThrow(message)
})
