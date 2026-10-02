// `pnpm bench`: builds the benchmark page, runs every scenario in a fresh
// headless Chrome page, prints the results line (RESULTS_MARKER) on stdout
// and a summary on stderr. --check compares counters with baselines/;
// --update-baseline rewrites them. Refuses macOS unless --local.
import { execFileSync } from 'node:child_process'
import { cpus, platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright-core'
import { build, preview, type PreviewServer } from 'vite'
import { applyBaselineFlags } from './baseline-files.ts'
import { benchHostRefusal, parseBenchArgs } from './bench-args.ts'
import { discoverChrome } from './chrome.ts'
import type { BenchPageApi } from './page/bench-global.ts'
import {
  RESULTS_MARKER,
  SCENARIOS,
  type BenchHost,
  type PageScenarioReport,
  type ScenarioName,
  type ScenarioResult,
} from './results.ts'
import { LOOP_END_MARK, LOOP_START_MARK, gcPausesFromTrace, summarizeFrames } from './timings.ts'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
// GC events, plus the page's performance.mark loop bounds (blink.user_timing).
const TRACE_CATEGORIES = ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'blink.user_timing']
const LOOP_WINDOW = { start: LOOP_START_MARK, end: LOOP_END_MARK }

async function servePage(): Promise<PreviewServer> {
  await build({ root: packageRoot, logLevel: 'warn', build: { emptyOutDir: true } })
  return preview({ root: packageRoot, logLevel: 'warn', preview: { host: '127.0.0.1', port: 0 } })
}

function serverUrl(server: PreviewServer): string {
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('bench: the preview server reported no URL')
  return url
}

async function runInPage(browser: Browser, url: string, scenario: ScenarioName): Promise<{ report: PageScenarioReport; trace: string }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    await browser.startTracing(page, { categories: TRACE_CATEGORIES })
    let report: PageScenarioReport
    let trace: string
    try {
      await page.goto(`${url}?scenario=${scenario}`)
      report = await page.evaluate(() => {
        const api: BenchPageApi | undefined = window.__waicaBench
        if (!api) throw new Error('bench: page entry did not load')
        return api.result
      })
    } finally {
      // Stopped on every path, so a failed scenario never leaves tracing on.
      trace = (await browser.stopTracing()).toString('utf8')
    }
    return { report, trace }
  } finally {
    await page.close()
  }
}

function commitSha(): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: packageRoot, encoding: 'utf8' }).trim()
}

/** Where a run's results come from: the measured commit and the host that ran it. */
type Provenance = Pick<ScenarioResult, 'commit' | 'host'>

async function runEachScenario(browser: Browser, url: string, provenance: Provenance): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    const { report, trace } = await runInPage(browser, url, scenario)
    const timings = { ...summarizeFrames(report.frameMs), gcPauses: gcPausesFromTrace(trace, LOOP_WINDOW) }
    results.push({ scenario, ...provenance, counters: report.counters, timings })
  }
  return results
}

/** Each resource is released by its own finally, whichever later step fails. */
async function runScenarios(host: BenchHost, executablePath: string): Promise<ScenarioResult[]> {
  const commit = commitSha()
  const server = await servePage()
  try {
    const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader'] })
    try {
      return await runEachScenario(browser, serverUrl(server), { commit, host })
    } finally {
      await browser.close()
    }
  } finally {
    await server.close()
  }
}

function summary(result: ScenarioResult): string {
  const { counters, timings } = result
  return `${result.scenario}: ${counters.drawCalls} draw calls, ${counters.materials} materials, ${counters.entitiesSpawned} spawned, median ${timings.medianMs.toFixed(2)} ms, p95 ${timings.p95Ms.toFixed(2)} ms`
}

async function main(): Promise<void> {
  const args = parseBenchArgs(process.argv.slice(2))
  const refusal = benchHostRefusal(platform(), args)
  if (refusal) {
    process.stderr.write(`${refusal}\n`)
    process.exitCode = 1
    return
  }
  const chrome = discoverChrome()
  const host: BenchHost = { platform: platform(), cpus: cpus().length, chrome: chrome.version }
  const results = await runScenarios(host, chrome.executablePath)
  for (const result of results) process.stderr.write(`${summary(result)}\n`)
  process.stdout.write(`${RESULTS_MARKER}${JSON.stringify(results)}\n`)
  if (!applyBaselineFlags(results, args)) process.exitCode = 1
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
