// Permanent CA-15/18 editor flow. No #151 exception: a blank frame is red.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { exerciseShadowQuality, exerciseShadowOverrides, openShadowAdvanced, SHADOW_SELECTORS } from './runtime-e2e-editor-shadows-controls.mjs'
import { shadowUiCapture } from './runtime-e2e-editor-shadows-capture.mjs'
import { exerciseShadowHelpers } from './runtime-e2e-editor-shadows-helpers.mjs'
import { openShadowProject, readShadowScene, selectShadowEntity, setShadowToggle, shadowProjectFiles, shadowRuntimeState, SHADOW_SCENE_PATH, SHADOW_SUN_PATH, sunOverrides } from './runtime-e2e-editor-shadows-project.mjs'

async function roundTrip(context, files) {
  const { page } = context
  const scene = await readShadowScene(page)
  const before = await shadowRuntimeState(page)
  const saved = await page.evaluate(async (paths) => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await globalThis.__waicaEditor.readText(path)]))), [SHADOW_SCENE_PATH, SHADOW_SUN_PATH])
  await page.getByRole('button', { name: '← projects', exact: true }).click()
  await openShadowProject(page, { ...files, ...saved })
  await selectShadowEntity(page, 'Sun')
  await openShadowAdvanced(page)
  const after = await shadowRuntimeState(page)
  assert.deepEqual(await readShadowScene(page), scene, 'reopening the saved MemFS project must restore exact authored JSON')
  assert.deepEqual(after, before, 'reopening must restore effective runtime shadow policy and overrides')
  assert.equal(sunOverrides(scene).shadowMapSize, undefined, 'prefab reset must remain distinct from explicit null scene inheritance')
  await shadowUiCapture(context, 'persisted-roundtrip')
  return { scene, before, after }
}

async function editorShadowMetadata(context) {
  const run = promisify(execFile)
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    run('git', ['rev-parse', 'HEAD'], { cwd: context.root }), run('git', ['status', '--porcelain'], { cwd: context.root }),
  ])
  const ui = await context.page.evaluate(() => {
    const style = globalThis.getComputedStyle(globalThis.document.documentElement)
    return { tokens: Object.fromEntries(['--bg', '--bg-panel', '--accent'].map((token) => [token, style.getPropertyValue(token).trim()])), rows: globalThis.document.querySelectorAll('.ed-inspector .ed-row').length }
  })
  return { commit: commit.trim(), dirty: status.length > 0, browser: context.chrome.version, backend: (await shadowRuntimeState(context.page)).backend, selectors: SHADOW_SELECTORS, ui, referenceCapture: null }
}

async function runFlow(context, files) {
  await openShadowProject(context.page, files)
  const runtime = await shadowRuntimeState(context.page)
  assert.ok(['webgl2', 'webgpu'].includes(runtime.backend), 'editor must report a real backend')
  if (context.renderLeg) assert.equal(runtime.backend, context.renderLeg.backend, 'editor must use the requested backend, never a fallback')
  assert.equal(runtime.sun.effective.mapSize, 512)
  await context.page.evaluate(() => { globalThis.__waicaShadowObservedGame = globalThis.__waicaEditor.viewportGame() })
  await setShadowToggle(context.page, 'Show grid', false)
  await setShadowToggle(context.page, 'Show helpers', false)
  await context.page.getByTitle("Go to the scene camera's pose", { exact: true }).click()
  const quality = await exerciseShadowQuality(context)
  context.stage = 'light-overrides'
  const overrides = await exerciseShadowOverrides(context)
  context.stage = 'coverage-helpers'
  const helpers = await exerciseShadowHelpers(context)
  context.stage = 'persisted-roundtrip'
  const persisted = await roundTrip(context, files)
  return { ...(await editorShadowMetadata(context)), quality, overrides, helpers, persisted }
}

export async function runEditorShadowsFlow(options) {
  const context = { ...options, screenshots: [], uiStates: [], stage: 'fixture' }
  const errors = []
  const pageError = (error) => errors.push({ stage: context.stage, message: String(error), stack: error.stack })
  const consoleError = (message) => { if (message.type() === 'error') errors.push({ stage: context.stage, message: message.text() }) }
  context.page.on('pageerror', pageError)
  context.page.on('console', consoleError)
  try {
    const report = await runFlow(context, shadowProjectFiles(options.files))
    const result = { ...report, screenshots: context.screenshots, uiStates: context.uiStates, errors, status: errors.length ? 'failed' : 'passed' }
    console.log(`waica editor shadows e2e: ${JSON.stringify(result)}`)
    assert.deepEqual(errors, [], 'shadow UI transitions must raise no page or console errors')
    return result
  } catch (error) {
    await shadowUiCapture(context, 'failure').catch(() => {})
    console.error(`waica editor shadows FAILED: ${JSON.stringify({ error: error.message, errors, screenshots: context.screenshots, runtime: await shadowRuntimeState(context.page).catch(() => null) })}`)
    throw error
  } finally {
    context.page.off('pageerror', pageError)
    context.page.off('console', consoleError)
  }
}
