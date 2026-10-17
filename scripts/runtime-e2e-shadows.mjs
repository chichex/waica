// Issue #203 CA-17/18. No blank-frame exception: each backend owes positive pixels.
import { disabledFlags, farCamera, independentReceivers, isolatedLight, movingCaster, staticGltf } from './runtime-e2e-shadows-cases.mjs'
import { animatedGltf } from './runtime-e2e-shadows-animation.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

async function runCases(context) {
  const results = {}
  const failures = []
  const cases = [
    ['sun', () => isolatedLight(context, 'sun')], ['point', () => isolatedLight(context, 'point')],
    ['sunFlags', () => disabledFlags(context, 'sun')], ['pointFlags', () => disabledFlags(context, 'point')],
    ['receivers', () => independentReceivers(context)], ['moving', () => movingCaster(context)],
    ['camera', () => farCamera(context)], ['gltf', () => staticGltf(context)], ['animated', () => animatedGltf(context)],
  ]
  for (const [name, exercise] of cases) {
    try { results[name] = await exercise() } catch (error) {
      failures.push(new Error(`${name}: ${error.message}`, { cause: error }))
    }
  }
  const run = promisify(execFile)
  const { stdout: commit } = await run('git', ['rev-parse', 'HEAD'], { cwd: context.root })
  const { stdout: changes } = await run('git', ['status', '--porcelain'], { cwd: context.root })
  const report = { backend: context.renderBackend, browser: context.chrome.version, commit: commit.trim(), dirty: changes.length > 0, ...results }
  console.log(`waica shadow e2e: ${JSON.stringify({ ...report, failures: failures.map((error) => error.message) })}`)
  if (failures.length) throw new AggregateError(failures, `${failures.length} shadow cases failed: ${failures.map((error) => error.message).join('\n')}`)
  return report
}

export async function runShadowLeg(options) {
  const { helpers, playwright, chrome } = options
  const project = await helpers.makeDemoProject({ ...options, archetype: 'third-person', name: 'waica-shadows' })
  const inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
  const context = { ...options, project, inspector }
  try {
    return { shadows: await runCases(context) }
  } finally {
    await inspector.close()
  }
}
