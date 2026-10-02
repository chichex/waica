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
import { RESULTS_MARKER } from './remote-plan.ts'
import { SCENARIOS, type BenchHost, type PageScenarioReport, type ScenarioName, type ScenarioResult } from './results.ts'
import { gcPausesFromTrace, summarizeFrames } from './timings.ts'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const GC_TRACE_CATEGORIES = ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc']

async function servePage(): Promise<PreviewServer> {
  await build({ root: packageRoot, logLevel: 'warn', build: { emptyOutDir: true } })
  return preview({ root: packageRoot, logLevel: 'warn', preview: { host: '127.0.0.1', port: 0 } })
}

function serverUrl(server: PreviewServer): string {
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('bench: the preview server reported no URL')
  return url
}

async function runInPage(browser: Browser, url: string, scenario: ScenarioName): Promise<{ report: PageScenarioReport; trace: string | null }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await browser.startTracing(page, { categories: GC_TRACE_CATEGORIES })
  try {
    await page.goto(`${url}?scenario=${scenario}`)
    const report = await page.evaluate(() => {
      const api: BenchPageApi | undefined = window.__waicaBench
      if (!api) throw new Error('bench: page entry did not load')
      return api.result
    })
    return { report, trace: (await browser.stopTracing()).toString('utf8') }
  } finally {
    await page.close()
  }
}

function commitSha(): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: packageRoot, encoding: 'utf8' }).trim()
}

async function runScenarios(host: BenchHost, executablePath: string): Promise<ScenarioResult[]> {
  const server = await servePage()
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader'] })
  const commit = commitSha()
  try {
    const results: ScenarioResult[] = []
    for (const scenario of SCENARIOS) {
      const { report, trace } = await runInPage(browser, serverUrl(server), scenario)
      const gcPauses = trace === null ? null : gcPausesFromTrace(trace)
      results.push({ scenario, commit, host, counters: report.counters, timings: { ...summarizeFrames(report.frameMs), gcPauses } })
    }
    return results
  } finally {
    await browser.close()
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

await main()
