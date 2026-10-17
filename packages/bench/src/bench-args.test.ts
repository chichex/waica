import { describe, expect, it } from 'vitest'
import { benchHostRefusal, chromeLaunchArgs, parseBenchArgs, parseRemoteArgs } from './bench-args.ts'

describe('parseBenchArgs', () => {
  it('defaults to a plain run', () => {
    expect(parseBenchArgs([])).toEqual({ check: false, gpu: false, local: false, updateBaseline: false, backend: undefined })
  })

  it('reads --check, --local and --update-baseline', () => {
    expect(parseBenchArgs(['--check', '--local'])).toEqual({
      check: true,
      gpu: false,
      local: true,
      updateBaseline: false,
      backend: undefined,
    })
    expect(parseBenchArgs(['--update-baseline']).updateBaseline).toBe(true)
  })

  it('reads --gpu', () => {
    expect(parseBenchArgs(['--gpu']).gpu).toBe(true)
  })

  it.each(['webgl2', 'webgpu', 'both'])('selects %s independently of hardware access, locally and remotely', (backend) => {
    expect(parseBenchArgs([`--backend=${backend}`])).toMatchObject({ backend, gpu: false })
    expect(parseRemoteArgs(['--gpu', `--backend=${backend}`, '--check'])).toMatchObject({ backend, gpu: true, check: true })
  })

  it('rejects unknown flags, including names inherited from Object.prototype', () => {
    expect(() => parseBenchArgs(['--fast'])).toThrow(/unknown flag: --fast/)
    expect(() => parseBenchArgs(['constructor'])).toThrow(/unknown flag: constructor/)
    expect(() => parseBenchArgs(['toString'])).toThrow(/unknown flag: toString/)
  })

  it('rejects --update-baseline with --check, which could never fail', () => {
    expect(() => parseBenchArgs(['--update-baseline', '--check'])).toThrow(/cannot be combined/)
  })

  it('rejects invalid and repeated backend selectors', () => {
    expect(() => parseBenchArgs(['--backend=auto'])).toThrow(/--backend/)
    expect(() => parseBenchArgs(['--backend=webgl2', '--backend=webgpu'])).toThrow(/only.*once/)
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
  it('accepts --gpu, which the host run receives', () => {
    expect(parseRemoteArgs(['--gpu']).gpu).toBe(true)
  })

  it('accepts --check and --update-baseline', () => {
    expect(parseRemoteArgs(['--check']).check).toBe(true)
    expect(parseRemoteArgs(['--update-baseline']).updateBaseline).toBe(true)
  })

  it('rejects --local, which has no effect on the remote host', () => {
    expect(() => parseRemoteArgs(['--local'])).toThrow(/--local/)
  })
})

describe('chromeLaunchArgs', () => {
  it.each([false, true])('forces browser capabilities without conflating --gpu=%s with backend', (gpu) => {
    const webgl = chromeLaunchArgs(gpu, 'webgl2')
    const webgpu = chromeLaunchArgs(gpu, 'webgpu')
    expect(webgl).toContain('--disable-features=WebGPUService')
    expect(webgl).not.toContain('--enable-unsafe-webgpu')
    expect(webgpu).toContain('--enable-unsafe-webgpu')
    expect(webgpu).not.toContain('--disable-features=WebGPUService')
    expect(webgl.includes('--use-angle=vulkan')).toBe(gpu)
    expect(webgpu.includes('--use-angle=vulkan')).toBe(gpu)
  })

  it('renders in software with SwiftShader by default', () => {
    expect(chromeLaunchArgs(false)).toEqual(['--enable-unsafe-swiftshader'])
  })

  it('renders on the host GPU through ANGLE on Vulkan with --gpu', () => {
    const args = chromeLaunchArgs(true)
    expect(args).toContain('--use-angle=vulkan')
    expect(args).toContain('--ignore-gpu-blocklist')
    expect(args).not.toContain('--enable-unsafe-swiftshader')
  })
})
