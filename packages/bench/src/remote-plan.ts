/**
 * Pure pieces of `pnpm bench:remote`: what to run on the host and how to
 * read its answers. run-remote.ts owns the SSH and Git side effects.
 */

/** The dedicated clone on the host; the host's own checkouts are never touched. */
export const BENCH_CLONE_DIR = '~/waica-bench'
/** Prefix of the single stdout line that carries the results JSON. */
export const RESULTS_MARKER = 'WAICA_BENCH_RESULTS '

const PNPM_VERSION = '11.4.0'
const MIN_NODE: readonly [number, number] = [22, 18]

export function resolveBenchHost(env: Readonly<Record<string, string | undefined>>): string {
  const host = env.WAICA_BENCH_HOST?.trim()
  if (!host) {
    throw new Error(
      'bench:remote: WAICA_BENCH_HOST is not set. Set it to the SSH host that runs the benchmark, e.g. `WAICA_BENCH_HOST=chichex-linux pnpm bench:remote`.',
    )
  }
  return host
}

/** Null when an origin branch contains `sha`; otherwise the message with the push command. */
export function unpushedRefusal(
  sha: string,
  originBranches: readonly string[],
  branch: string,
): string | null {
  if (originBranches.length > 0) return null
  return `bench:remote: commit ${sha} is not on origin, so the host cannot check it out. Push it first: git push -u origin ${branch}`
}

/** Prints one `tool=<version|missing>` line per prerequisite. */
export const PREFLIGHT_SCRIPT = [
  'v() { if command -v "$1" >/dev/null 2>&1; then "$@" 2>/dev/null | head -n 1; else echo missing; fi; }',
  'echo "git=$(v git --version)"',
  'echo "node=$(v node --version)"',
  'echo "pnpm=$(v pnpm --version)"',
  'c=missing; for b in google-chrome google-chrome-stable chromium chromium-browser; do',
  '  if command -v "$b" >/dev/null 2>&1; then c=$("$b" --version 2>/dev/null); break; fi',
  'done; echo "chrome=$c"',
].join('\n')

export type PreflightReport = Record<string, string>

export function parsePreflight(stdout: string): PreflightReport {
  const report: PreflightReport = {}
  for (const line of stdout.split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) report[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return report
}

function nodeIsRecentEnough(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)/.exec(version)
  if (!match) return false
  const [major, minor] = [Number(match[1]), Number(match[2])]
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1])
}

export interface MissingPrerequisite {
  tool: string
  install: string
}

const INSTALL_HINTS: Record<string, string> = {
  git: 'install git with the host package manager',
  node: `install Node.js >= ${MIN_NODE.join('.')}`,
  pnpm: `npm install -g pnpm@${PNPM_VERSION}`,
  chrome: 'install google-chrome-stable',
}

export function missingPrerequisites(report: PreflightReport): MissingPrerequisite[] {
  const missing: MissingPrerequisite[] = []
  for (const tool of Object.keys(INSTALL_HINTS)) {
    const value = report[tool]
    const absent = value === undefined || value === '' || value === 'missing'
    const tooOld = tool === 'node' && !absent && !nodeIsRecentEnough(value)
    if (absent || tooOld) missing.push({ tool, install: INSTALL_HINTS[tool] ?? '' })
  }
  return missing
}

export interface RemoteRun {
  sha: string
  repoUrl: string
  benchArgs: readonly string[]
}

/** The shell script the host runs: clone or refresh, exact checkout, frozen install, bench. */
export function remoteRunScript({ sha, repoUrl, benchArgs }: RemoteRun): string {
  const args = benchArgs.length > 0 ? ` ${benchArgs.join(' ')}` : ''
  return [
    'set -eu',
    `if [ ! -d ${BENCH_CLONE_DIR}/.git ]; then git clone --quiet ${repoUrl} ${BENCH_CLONE_DIR}; fi`,
    `cd ${BENCH_CLONE_DIR}`,
    'git fetch --quiet origin',
    `git checkout --quiet --detach ${sha}`,
    'pnpm install --frozen-lockfile >&2',
    `pnpm bench${args}`,
  ].join('\n')
}

export function extractResults(stdout: string): unknown {
  const line = stdout.split('\n').find((l) => l.startsWith(RESULTS_MARKER))
  if (!line) throw new Error('bench:remote: the host printed no results line')
  return JSON.parse(line.slice(RESULTS_MARKER.length)) as unknown
}
