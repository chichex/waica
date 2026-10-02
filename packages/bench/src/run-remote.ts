// `pnpm bench:remote`: runs `pnpm bench` on the SSH host named by
// WAICA_BENCH_HOST at the current pushed commit, in a dedicated clone
// (remote-plan.ts BENCH_CLONE_DIR), and streams the results back.
// --check and --update-baseline apply locally to the returned results.
import { execFileSync, spawn } from 'node:child_process'
import { applyBaselineFlags } from './baseline-files.ts'
import { parseRemoteArgs } from './bench-args.ts'
import {
  PREFLIGHT_SCRIPT,
  extractResults,
  httpsCloneUrl,
  missingPrerequisites,
  originBranches,
  parsePreflight,
  remoteRunScript,
  resolveBenchHost,
  unpushedRefusal,
} from './remote-plan.ts'
import { parseScenarioResults } from './results-guard.ts'
import { RESULTS_MARKER } from './results.ts'

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/** Runs `script` with bash on `host`; stdout is captured, stderr streams through. */
function ssh(host: string, script: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', host, 'bash -s'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }))
    child.stdin.end(script)
  })
}

/** The commit to benchmark, or a refusal when the host could not fetch it. */
function pushedCommit(): string {
  const sha = git('rev-parse', 'HEAD')
  git('fetch', '--quiet', 'origin')
  const branches = originBranches(git('branch', '--remotes', '--contains', sha, '--list', 'origin/*'))
  const refusal = unpushedRefusal(sha.slice(0, 7), branches, git('rev-parse', '--abbrev-ref', 'HEAD'))
  if (refusal) throw new Error(refusal)
  return sha
}

async function assertHostReady(host: string): Promise<void> {
  const { code, stdout } = await ssh(host, PREFLIGHT_SCRIPT)
  if (code !== 0) throw new Error(`bench:remote: cannot reach ${host} over SSH (exit ${code})`)
  const missing = missingPrerequisites(parsePreflight(stdout))
  if (missing.length === 0) return
  const lines = missing.map((m) => `  ${m.tool}: ${m.install}`)
  throw new Error(`bench:remote: ${host} is missing prerequisites:\n${lines.join('\n')}`)
}

async function main(): Promise<void> {
  const args = parseRemoteArgs(process.argv.slice(2))
  const host = resolveBenchHost(process.env)
  const sha = pushedCommit()
  await assertHostReady(host)
  const script = remoteRunScript({ sha, repoUrl: httpsCloneUrl(git('remote', 'get-url', 'origin')), gpu: args.gpu })
  const { code, stdout } = await ssh(host, script)
  if (code !== 0) throw new Error(`bench:remote: the bench failed on ${host} (exit ${code})`)
  const results = parseScenarioResults(extractResults(stdout))
  process.stdout.write(`${RESULTS_MARKER}${JSON.stringify(results)}\n`)
  if (!applyBaselineFlags(results, args)) process.exitCode = 1
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
