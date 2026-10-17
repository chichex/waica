import assert from 'node:assert/strict'
import { assertReceiverPair } from './runtime-e2e-shadows-pixels.mjs'
import { assertLiveShadowPixels, assertSameShadowGame, shadowPixelCapture, shadowUiCapture } from './runtime-e2e-editor-shadows-capture.mjs'
import { selectShadowEntity, settleShadowFrame, shadowRuntimeState, showShadowSceneInspector, sunOverrides, waitShadowSaved } from './runtime-e2e-editor-shadows-project.mjs'

export const SHADOW_SELECTORS = {
  quality: "combobox 'Shadow quality'", distance: "spinbutton 'Scene shadow max distance'",
  advanced: "button 'Advanced shadows'", map: "group 'Shadow map size' / combobox 'Shadow map size'",
  inherit: "button 'Inherit scene for Shadow map size'", reset: 'title "Reset to the prefab\'s value"',
  helpers: 'title "Show helpers"', grid: 'title "Show grid"', selection: '.ed-x-subtree button.ed-x-item',
}

async function setQuality(context, quality) {
  const { page } = context
  context.stage = `quality:${quality}`
  await page.getByRole('combobox', { name: 'Shadow quality', exact: true }).selectOption(quality)
  await settleShadowFrame(page)
  await assertSameShadowGame(page, true)
  assert.equal((await shadowRuntimeState(page)).policy.quality, quality, 'quality must apply live before the debounced save')
  const scene = await waitShadowSaved(page, (value) => value.render.shadows.quality === quality, `quality ${quality}`)
  assert.equal(sunOverrides(scene).shadowMapSize, 512, 'quality edits must preserve the instance override')
}

export async function exerciseShadowQuality(context) {
  const { page } = context
  await showShadowSceneInspector(page)
  assert.equal(await page.getByRole('combobox', { name: 'Shadow quality', exact: true }).inputValue(), 'medium')
  const initial = await shadowPixelCapture(context, 'initial-medium')
  await setQuality(context, 'off')
  context.off = await shadowPixelCapture(context, 'off')
  const initialPixels = assertReceiverPair(initial, context.off)
  const offState = await shadowRuntimeState(page)
  assert.equal(offState.sun.effective.enabled, false)
  assert.equal(offState.point.effective.enabled, false)
  assert.equal(offState.sun.castShadow, false)
  await shadowUiCapture(context, 'quality-off')
  const results = {}
  for (const quality of ['medium', 'low', 'high', 'medium']) {
    await setQuality(context, quality)
    results[`${quality}-${Object.keys(results).length}`] = await assertLiveShadowPixels(context, `quality-${quality}-${Object.keys(results).length}`)
  }
  const distance = page.getByRole('spinbutton', { name: 'Scene shadow max distance', exact: true })
  await distance.fill('32')
  await distance.press('Tab')
  assert.equal((await shadowRuntimeState(page)).policy.maxDistance, 32)
  await waitShadowSaved(page, (scene) => scene.render.shadows.maxDistance === 32, 'scene max distance 32')
  await shadowUiCapture(context, 'quality-medium-distance32')
  const history = await scenePolicyHistory(context)
  return { initial, initialPixels, off: context.off, live: results, distance: 32, history }
}

async function scenePolicyHistory(context) {
  const { page } = context
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: /Caster$/ }).focus()
  await page.keyboard.press('Control+z')
  const undo = await waitShadowSaved(page, (scene) => scene.render.shadows.maxDistance === 40, 'undo scene distance')
  assert.equal((await shadowRuntimeState(page)).policy.maxDistance, 40)
  await page.keyboard.press('Control+Shift+z')
  const redo = await waitShadowSaved(page, (scene) => scene.render.shadows.maxDistance === 32, 'redo scene distance')
  assert.equal((await shadowRuntimeState(page)).policy.maxDistance, 32)
  // History intentionally rebuilds the stage. Subsequent direct UI edits must not.
  await page.evaluate(() => { globalThis.__waicaShadowObservedGame = globalThis.__waicaEditor.viewportGame() })
  return { undo: undo.render.shadows, redo: redo.render.shadows }
}

export async function openShadowAdvanced(page) {
  const button = page.getByRole('button', { name: 'Advanced shadows', exact: true })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
}

async function expectMap(context, expected) {
  const { page } = context
  const scene = await waitShadowSaved(page, (value) => sunOverrides(value).shadowMapSize === expected.stored, `Sun map ${JSON.stringify(expected)}`)
  await settleShadowFrame(page)
  const runtime = await shadowRuntimeState(page)
  assert.equal(runtime.sun.effective.mapSize, expected.effective)
  assert.equal(runtime.sun.requested.shadowMapSize, expected.requested)
  assert.deepEqual(runtime.sun.nativeMapSize, [expected.effective, expected.effective])
  return { overrides: sunOverrides(scene), runtime, pixels: await assertLiveShadowPixels(context, expected.name) }
}

async function mapHistory(context) {
  const { page } = context
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: /Sun$/ }).focus()
  await page.keyboard.press('Control+z')
  const undo = await expectMap(context, { stored: null, requested: null, effective: 2048, name: 'map-undo-inherited' })
  await page.keyboard.press('Control+Shift+z')
  const redo = await expectMap(context, { stored: undefined, requested: 1024, effective: 1024, name: 'map-redo-prefab' })
  return { undo, redo }
}

export async function exerciseShadowOverrides(context) {
  const { page } = context
  await selectShadowEntity(page, 'Sun')
  await openShadowAdvanced(page)
  const group = page.getByRole('group', { name: 'Shadow map size', exact: true })
  assert.equal(await group.getByRole('checkbox', { name: 'Override Shadow map size', exact: true }).isChecked(), true)
  assert.equal(await group.getByRole('combobox', { name: 'Shadow map size', exact: true }).inputValue(), '512')
  await shadowUiCapture(context, 'light-instance512')
  context.stage = 'Sun:map512->1024'
  await group.getByRole('combobox', { name: 'Shadow map size', exact: true }).selectOption('1024')
  await assertSameShadowGame(page, true)
  const override = await expectMap(context, { stored: 1024, requested: 1024, effective: 1024, name: 'map-override1024' })
  context.stage = 'Sun:map1024->inherit2048'
  await group.getByRole('button', { name: 'Inherit scene for Shadow map size', exact: true }).click()
  const inherited = await expectMap(context, { stored: null, requested: null, effective: 2048, name: 'map-inherited2048' })
  assert.equal(await group.getByRole('checkbox', { name: 'Override Shadow map size', exact: true }).isChecked(), false)
  assert.match(await group.innerText(), /Inherited from scene.*Effective: 2048/s)
  await shadowUiCapture(context, 'light-inherited2048')
  context.stage = 'Sun:resetPrefab1024'
  await group.getByTitle("Reset to the prefab's value", { exact: true }).click()
  const reset = await expectMap(context, { stored: undefined, requested: 1024, effective: 1024, name: 'map-reset-prefab1024' })
  await shadowUiCapture(context, 'light-reset-prefab1024')
  const history = await mapHistory(context)
  const numeric = await exerciseShadowNumbers(context)
  return { override, inherited, reset, history, numeric }
}

async function exerciseShadowNumbers(context) {
  const { page } = context
  await openShadowAdvanced(page)
  const numbers = [
    ['Shadow max distance', 'shadowMaxDistance', 24], ['Shadow bias', 'shadowBias', 0],
    ['Shadow normal bias', 'shadowNormalBias', 0.03], ['Shadow radius', 'shadowRadius', 2],
  ]
  for (const [label, key, value] of numbers) {
    const group = page.getByRole('group', { name: label, exact: true })
    await group.getByRole('checkbox', { name: `Override ${label}`, exact: true }).check()
    await group.getByRole('spinbutton', { name: label, exact: true }).fill(String(value))
    await group.getByRole('spinbutton', { name: label, exact: true }).press('Tab')
    await waitShadowSaved(page, (scene) => sunOverrides(scene)[key] === value, `${key} ${value}`)
    assert.equal((await shadowRuntimeState(page)).sun.requested[key], value)
  }
  await shadowUiCapture(context, 'light-advanced-numeric-overrides')
  return (await shadowRuntimeState(page)).sun
}
