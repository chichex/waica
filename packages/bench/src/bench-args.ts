export type BackendSelection = 'webgl2' | 'webgpu' | 'both'

export interface BenchArgs {
  /** Browser capability selection for testing; absent preserves automatic choice. */
  backend?: BackendSelection
  /** Compare counters with the committed baselines and fail on any difference. */
  check: boolean
  /** Render on the host's GPU (ANGLE on Vulkan) instead of SwiftShader. */
  gpu: boolean
  /** Run on this machine even if it is macOS. */
  local: boolean
  /** Rewrite baselines/*.json from this run's results. */
  updateBaseline: boolean
}

const FLAGS: Record<string, Exclude<keyof BenchArgs, 'backend'>> = {
  '--check': 'check',
  '--gpu': 'gpu',
  '--local': 'local',
  '--update-baseline': 'updateBaseline',
}

const BACKEND_SELECTIONS: readonly BackendSelection[] = ['webgl2', 'webgpu', 'both']

function backendFlag(flag: string): BackendSelection | undefined {
  if (!flag.startsWith('--backend=')) return undefined
  const backend = BACKEND_SELECTIONS.find((value) => flag === `--backend=${value}`)
  if (!backend) throw new Error('bench: --backend must be webgl2, webgpu or both')
  return backend
}

export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  const args: BenchArgs = { check: false, gpu: false, local: false, updateBaseline: false, backend: undefined }
  for (const flag of argv) {
    const backend = backendFlag(flag)
    if (backend !== undefined) {
      if (args.backend !== undefined) throw new Error('bench: --backend may only be specified once')
      args.backend = backend
      continue
    }
    const key = Object.hasOwn(FLAGS, flag) ? FLAGS[flag] : undefined
    if (!key) throw new Error(`bench: unknown flag: ${flag}`)
    args[key] = true
  }
  if (args.updateBaseline && args.check) {
    // Rewriting first and comparing after would always match.
    throw new Error('bench: --update-baseline and --check cannot be combined')
  }
  return args
}

/** `bench:remote` flags: the same as `bench`, minus --local, which the remote run ignores. */
export function parseRemoteArgs(argv: readonly string[]): BenchArgs {
  const args = parseBenchArgs(argv)
  if (args.local) throw new Error('bench:remote: --local has no effect on the remote host')
  return args
}

/**
 * The benchmark loads a machine with a real browser and large scenes, so it
 * is meant for a Linux host; on macOS it refuses unless asked with --local.
 * Returns the refusal message, or null when the run may proceed.
 */
export function benchHostRefusal(platform: string, args: BenchArgs): string | null {
  if (platform !== 'darwin' || args.local) return null
  return [
    'bench: refusing to run on macOS — the benchmark runs on a Linux host.',
    'Run it remotely with `WAICA_BENCH_HOST=<host> pnpm bench:remote`, or pass --local to run here anyway.',
  ].join('\n')
}

/**
 * Headless Chrome on a host with no display falls back to SwiftShader, a
 * CPU renderer: the worst case. With --gpu, ANGLE on Vulkan reaches the
 * host's GPU (verified on chichex-linux: an RTX 5070 Ti). The renderer each
 * result records says which one actually ran.
 */
export function chromeLaunchArgs(gpu: boolean, backend?: Exclude<BackendSelection, 'both'>): string[] {
  const args = gpu
    ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu']
    : ['--enable-unsafe-swiftshader']
  if (backend === 'webgl2') args.push('--disable-features=WebGPUService')
  if (backend === 'webgpu') args.push('--enable-unsafe-webgpu')
  return args
}
