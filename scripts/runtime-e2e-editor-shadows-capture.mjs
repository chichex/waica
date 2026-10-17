import assert from 'node:assert/strict'
import { assertReceiverPair, receiverSamples } from './runtime-e2e-shadows-pixels.mjs'
import { settleShadowFrame, shadowRuntimeState } from './runtime-e2e-editor-shadows-project.mjs'

const RECEIVERS = { shadow: { x: 1.5, y: 0, z: 1.5 }, control: { x: -4, y: 0, z: 2 } }

export async function shadowUiCapture(context, state) {
  const { page, label, helpers } = context
  await settleShadowFrame(page)
  const filename = `${label}-editor-shadows-${state}-ui.png`
  await helpers.keepScreenshot(filename, (await page.screenshot()).toString('base64'))
  context.screenshots.push(filename)
  const ui = await page.evaluate(() => {
    const inspector = globalThis.document.querySelector('.ed-inspector')
    const visible = (node) => node.checkVisibility()
    const inputs = [...(inspector?.querySelectorAll('input, select') ?? [])].filter(visible).map((node) => ({
      name: node.getAttribute('aria-label') ?? node.labels?.[0]?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
      role: node.tagName === 'SELECT' ? 'combobox' : node.type,
      value: node.value, checked: node.type === 'checkbox' ? node.checked : undefined,
      readOnly: node.readOnly, invalid: node.getAttribute('aria-invalid'),
    }))
    const groups = [...(inspector?.querySelectorAll('[role="group"]') ?? [])].filter(visible).map((node) => ({ name: node.getAttribute('aria-label'), text: node.textContent.trim().replace(/\s+/g, ' ') }))
    return { inputs, groups }
  })
  context.uiStates.push({ state, filename, ...ui })
  return filename
}

export async function shadowPixelCapture(context, variant) {
  const { page, inspector, label, helpers } = context
  await settleShadowFrame(page)
  const points = await page.evaluate((receivers) => {
    const game = globalThis.__waicaEditor.viewportGame()
    return Object.fromEntries(Object.entries(receivers).map(([name, world]) => [name, game.worldToScreen(world)]))
  }, RECEIVERS)
  const canvas = page.locator('.ed-viewport canvas')
  const box = await canvas.boundingBox()
  for (const [name, point] of Object.entries(points)) {
    assert.ok(point && point.x >= 3 && point.y >= 3 && point.x < box.width - 3 && point.y < box.height - 3, `${name} 5x5 ROI must be inside the real viewport: ${JSON.stringify({ point, box })}`)
    points[name] = { x: Math.round(point.x), y: Math.round(point.y) }
  }
  const image = (await canvas.screenshot()).toString('base64')
  const filename = `${label}-editor-shadows-${variant}-viewport.png`
  await helpers.keepScreenshot(filename, image)
  context.screenshots.push(filename)
  const samples = await inspector.evaluate(receiverSamples, { image, points })
  const runtime = await shadowRuntimeState(page)
  return { variant, filename, samples, runtime }
}

export async function assertLiveShadowPixels(context, variant) {
  const capture = await shadowPixelCapture(context, variant)
  const pixels = assertReceiverPair(capture, context.off)
  assert.equal(capture.runtime.policy.quality === 'off', false)
  assert.equal(capture.runtime.sun.effective.enabled, true)
  assert.equal(capture.runtime.sun.castShadow, true)
  console.log(`waica editor shadows pixels: ${JSON.stringify({ variant, ...pixels, runtime: capture.runtime })}`)
  return { ...pixels, runtime: capture.runtime }
}

export async function assertSameShadowGame(page, expected) {
  const same = await page.evaluate(() => globalThis.__waicaEditor.viewportGame() === globalThis.__waicaShadowObservedGame)
  assert.equal(same, expected, 'live authoring must update the same viewport Game without rebuilding it')
}
