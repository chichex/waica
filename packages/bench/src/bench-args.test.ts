import { describe, expect, it } from 'vitest'
import { benchHostRefusal, parseBenchArgs, parseRemoteArgs } from './bench-args.ts'

describe('parseBenchArgs', () => {
  it('defaults to a plain run', () => {
    expect(parseBenchArgs([])).toEqual({ check: false, local: false, updateBaseline: false })
  })

  it('reads --check, --local and --update-baseline', () => {
    expect(parseBenchArgs(['--check', '--local'])).toEqual({
      check: true,
      local: true,
      updateBaseline: false,
    })
    expect(parseBenchArgs(['--update-baseline']).updateBaseline).toBe(true)
  })

  it('rejects unknown flags, including names inherited from Object.prototype', () => {
    expect(() => parseBenchArgs(['--fast'])).toThrow(/unknown flag: --fast/)
    expect(() => parseBenchArgs(['constructor'])).toThrow(/unknown flag: constructor/)
    expect(() => parseBenchArgs(['toString'])).toThrow(/unknown flag: toString/)
  })

  it('rejects --update-baseline with --check, which could never fail', () => {
    expect(() => parseBenchArgs(['--update-baseline', '--check'])).toThrow(/cannot be combined/)
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

describe('parseRemoteArgs', () => {
  it('accepts --check and --update-baseline', () => {
    expect(parseRemoteArgs(['--check']).check).toBe(true)
    expect(parseRemoteArgs(['--update-baseline']).updateBaseline).toBe(true)
  })

  it('rejects --local, which has no effect on the remote host', () => {
    expect(() => parseRemoteArgs(['--local'])).toThrow(/--local/)
  })
})
