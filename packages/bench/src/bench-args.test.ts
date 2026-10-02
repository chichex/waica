import { describe, expect, it } from 'vitest'
import { benchHostRefusal, parseBenchArgs } from './bench-args.ts'

describe('parseBenchArgs', () => {
  it('defaults to a plain run', () => {
    expect(parseBenchArgs([])).toEqual({ check: false, local: false, updateBaseline: false })
  })

  it('reads --check, --local and --update-baseline', () => {
    expect(parseBenchArgs(['--check', '--local', '--update-baseline'])).toEqual({
      check: true,
      local: true,
      updateBaseline: true,
    })
  })

  it('rejects unknown flags', () => {
    expect(() => parseBenchArgs(['--fast'])).toThrow(/unknown flag: --fast/)
  })
})

describe('benchHostRefusal', () => {
  it('refuses macOS and points to bench:remote', () => {
    const message = benchHostRefusal('darwin', parseBenchArgs([]))
    expect(message).toMatch(/Linux host/)
    expect(message).toMatch(/pnpm bench:remote/)
  })

  it('lets --local override the refusal on macOS', () => {
    expect(benchHostRefusal('darwin', parseBenchArgs(['--local']))).toBeNull()
  })

  it('allows Linux', () => {
    expect(benchHostRefusal('linux', parseBenchArgs([]))).toBeNull()
  })
})
