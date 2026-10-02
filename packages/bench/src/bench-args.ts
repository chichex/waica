export interface BenchArgs {
  /** Compare counters with the committed baselines and fail on any difference. */
  check: boolean
  /** Run on this machine even if it is macOS. */
  local: boolean
  /** Rewrite baselines/*.json from this run's results. */
  updateBaseline: boolean
}

const FLAGS: Record<string, keyof BenchArgs> = {
  '--check': 'check',
  '--local': 'local',
  '--update-baseline': 'updateBaseline',
}

export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  const args: BenchArgs = { check: false, local: false, updateBaseline: false }
  for (const flag of argv) {
    const key = FLAGS[flag]
    if (!key) throw new Error(`bench: unknown flag: ${flag}`)
    args[key] = true
  }
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
