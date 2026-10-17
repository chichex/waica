import assert from 'node:assert/strict'
import { shadowUiCapture } from './runtime-e2e-editor-shadows-capture.mjs'
import { readShadowScene, selectShadowEntity, setShadowToggle, settleShadowFrame, showShadowSceneInspector } from './runtime-e2e-editor-shadows-project.mjs'

export async function shadowHelperState(page) {
  return page.evaluate(() => {
    const game = globalThis.__waicaEditor.viewportGame()
    const objects = []
    const editorObjectNames = []
    game.scene.traverse((object) => {
      if (object.name.startsWith('waica:editor-')) editorObjectNames.push(object.name)
      if (object.name.startsWith('waica:editor-shadow-')) objects.push({ name: object.name, visible: object.visible, castShadow: object.castShadow, receiveShadow: object.receiveShadow, position: object.position.toArray(), scale: object.scale.toArray() })
    })
    return { objects, editorObjectNames, camera: game.camera.position.toArray() }
  })
}

async function assertVisibleCoverage(page, kind) {
  const state = await shadowHelperState(page)
  assert.deepEqual(state.objects.filter((object) => object.visible).map((object) => object.name), kind ? [`waica:editor-shadow-${kind}`] : [])
  for (const object of state.objects) {
    assert.equal(object.castShadow, false)
    assert.equal(object.receiveShadow, false)
  }
  return state
}

// A read-only per-RAF check against the native camera used by this very frame.
// Comparing vertices catches stale geometry even when helper.camera is the right reference.
function currentSunFit() {
  const game = globalThis.__waicaEditor.viewportGame()
  const helper = game.scene.getObjectByName('waica:editor-shadow-sun')
  const light = game.find('Sun').components.find((item) => item.constructor.componentName === 'Sun').light
  const camera = light.shadow.camera
  const points = helper.geometry.getAttribute('position')
  const corner = camera.position.clone().set(1, 1, 1).applyMatrix4(camera.projectionMatrixInverse)
  const index = helper.pointMap.f4[0]
  const actual = [points.getX(index), points.getY(index), points.getZ(index)]
  const expected = corner.toArray()
  return { sameCamera: helper.camera === camera, sameMatrix: helper.matrix === camera.matrixWorld, error: Math.max(...actual.map((value, axis) => Math.abs(value - expected[axis]))), camera: game.camera.position.toArray(), shadowPosition: camera.position.toArray(), bounds: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far] }
}

async function orbitSelectedSun(context) {
  const { page } = context
  const authoredBefore = await readShadowScene(page)
  const before = await page.evaluate(currentSunFit)
  const box = await page.locator('.ed-viewport canvas').boundingBox()
  const start = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.55 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button: 'middle' })
  const samples = []
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(start.x + step * 12, start.y - step * 3)
    samples.push(await page.evaluate(currentSunFit))
  }
  await page.mouse.up({ button: 'middle' })
  const after = await page.evaluate(currentSunFit)
  assert.notDeepEqual(after.camera, before.camera, 'middle orbit must change the active Editor Camera')
  assert.notDeepEqual(after.shadowPosition, before.shadowPosition, 'Sun coverage must follow that active camera')
  for (const sample of samples) {
    assert.equal(sample.sameCamera && sample.sameMatrix, true)
    assert.ok(sample.error < 0.0001, `Sun helper must match this frame's native coverage, not the previous frame: ${JSON.stringify(sample)}`)
  }
  await page.waitForTimeout(1500)
  assert.deepEqual(await readShadowScene(page), authoredBefore, 'read-only coverage and camera navigation must leave authored JSON untouched')
  await shadowUiCapture(context, 'selected-sun-orbit-current-coverage')
  return { before, after, samples, authoredCamera: authoredBefore.camera }
}

async function pointCoverage(context) {
  const { page } = context
  await selectShadowEntity(page, 'Point')
  const state = await assertVisibleCoverage(page, 'point')
  const helper = state.objects.find((object) => object.visible)
  assert.deepEqual(helper.scale, [2, 2, 2], 'Point helper must show shadow radius 2, not luminous range 9')
  const emission = await page.evaluate(() => {
    const game = globalThis.__waicaEditor.viewportGame()
    const component = game.find('Point').components.find((item) => item.constructor.componentName === 'PointLight')
    return component.light.getWorldPosition(component.light.position.clone()).toArray()
  })
  assert.deepEqual(helper.position, emission)
  await shadowUiCapture(context, 'selected-point-radius2')
  return state
}

async function helpersOffAndSelection(context) {
  const { page } = context
  await setShadowToggle(page, 'Show helpers', false)
  const hidden = await assertVisibleCoverage(page, null)
  await setShadowToggle(page, 'Show helpers', true)
  await assertVisibleCoverage(page, 'sun')
  await selectShadowEntity(page, 'Caster')
  const nonLight = await assertVisibleCoverage(page, null)
  await selectShadowEntity(page, 'Sun')
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: /Point$/ }).click({ modifiers: ['Control'] })
  await settleShadowFrame(page)
  const multi = await assertVisibleCoverage(page, null)
  await selectShadowEntity(page, 'Sun')
  return { hidden, nonLight, multi }
}

async function globalOffCoverage(context) {
  const { page } = context
  await showShadowSceneInspector(page)
  await page.getByRole('combobox', { name: 'Shadow quality', exact: true }).selectOption('off')
  await selectShadowEntity(page, 'Sun')
  const off = await assertVisibleCoverage(page, null)
  await shadowUiCapture(context, 'selected-sun-global-off-no-coverage')
  await showShadowSceneInspector(page)
  await page.getByRole('combobox', { name: 'Shadow quality', exact: true }).selectOption('medium')
  await selectShadowEntity(page, 'Sun')
  await assertVisibleCoverage(page, 'sun')
  return off
}

async function playWithoutCoverage(context) {
  const { page } = context
  const authored = await readShadowScene(page)
  await page.getByRole('button', { name: '▶ Play', exact: true }).click()
  await page.getByRole('button', { name: '⏹ Stop', exact: true }).waitFor()
  await page.waitForFunction(() => globalThis.__waicaEditor.viewportGame()?.find('Sun') !== undefined)
  await settleShadowFrame(page)
  const play = await shadowHelperState(page)
  assert.deepEqual(play.objects, [], 'Play must contain no coverage OBJECTS, not merely invisible helpers')
  assert.deepEqual(play.editorObjectNames, [], 'the game-only screenshot surface must contain no editor helper objects of any kind')
  await shadowUiCapture(context, 'play-no-helper-objects')
  const image = (await page.locator('.ed-viewport canvas').screenshot()).toString('base64')
  const filename = `${context.label}-editor-shadows-play-game-only.png`
  await context.helpers.keepScreenshot(filename, image)
  context.screenshots.push(filename)
  await page.getByRole('button', { name: '⏹ Stop', exact: true }).click()
  await page.getByRole('button', { name: '▶ Play', exact: true }).waitFor()
  await settleShadowFrame(page)
  await selectShadowEntity(page, 'Sun')
  const edit = await assertVisibleCoverage(page, 'sun')
  assert.deepEqual(await readShadowScene(page), authored, 'Play/Stop must not alter the scene or authored camera')
  await shadowUiCapture(context, 'edit-after-stop-selected-sun')
  return { play, edit, gameOnlyScreenshot: filename }
}

export async function exerciseShadowHelpers(context) {
  const { page } = context
  await setShadowToggle(page, 'Show helpers', true)
  await selectShadowEntity(page, 'Sun')
  const selectedSun = await assertVisibleCoverage(page, 'sun')
  await shadowUiCapture(context, 'selected-sun-coverage')
  const visibility = await helpersOffAndSelection(context)
  const orbit = await orbitSelectedSun(context)
  const point = await pointCoverage(context)
  const globalOff = await globalOffCoverage(context)
  const play = await playWithoutCoverage(context)
  return { selectedSun, visibility, orbit, point, globalOff, ...play }
}
