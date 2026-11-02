import assert from 'node:assert/strict'
import { assertSameShadowGame, shadowUiCapture } from './runtime-e2e-editor-shadows-capture.mjs'
import { openShadowAdvanced } from './runtime-e2e-editor-shadows-controls.mjs'
import { readShadowScene, selectShadowEntity, setShadowToggle, settleShadowFrame, showShadowSceneInspector, SPOT_PROPS, spotProps, spotRuntimeState, waitShadowSaved } from './runtime-e2e-editor-shadows-project.mjs'

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

// Issue #204 CA-16: the SpotLight in the same MemFS project. Its cone is a helper
// object like the coverage ones, so Play must hold none of it.
const CONE = 'waica:editor-spot-cone'

async function spotCones(page) {
  return page.evaluate((name) => {
    const cones = []
    globalThis.__waicaEditor.viewportGame().scene.traverse((object) => {
      if (object.name !== name) return
      const { x, y, z, w } = object.quaternion
      // The cone's local +z axis, turned by its quaternion: where the wire points in the world.
      cones.push({ visible: object.visible, position: object.position.toArray(), axis: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)], built: object.userData.cone ?? null })
    })
    return cones
  }, CONE)
}

/** The edit view's cone, fitted to the live Spot: apex at its world position, along its world direction, `distance` long and `distance * tan(angle)` wide. */
async function assertSpotCone(page, angle) {
  const [spot, cones] = [await spotRuntimeState(page), await spotCones(page)]
  assert.equal(cones.length, 1, 'one SpotLight draws one cone')
  const [cone] = cones
  assert.equal(cone.visible, true, 'the helpers toggle is on and the Spot has a finite distance')
  assert.deepEqual(cone.position, spot.position, 'the cone starts at the light, offset included')
  for (const axis of [0, 1, 2]) assert.ok(Math.abs(cone.axis[axis] - spot.direction[axis]) < 1e-6, `the cone must point along the light: ${JSON.stringify({ cone, spot })}`)
  assert.equal(cone.built.length, spot.distance)
  assert.ok(Math.abs(cone.built.radius - spot.distance * Math.tan((angle * Math.PI) / 180)) < 1e-6, `the cone must be ${angle} degrees wide: ${JSON.stringify(cone.built)}`)
  assert.ok(Math.abs(spot.lightAngle - angle) < 1e-6 && spot.angle === angle, 'the cone and the runtime light must agree on the angle')
  return { cone, spot }
}

async function spotAngle(page, angle) {
  const field = page.locator('label.ed-row-slider').filter({ hasText: 'Angle (degrees)' }).getByRole('spinbutton')
  await field.fill(String(angle))
  await field.press('Tab')
  await settleShadowFrame(page)
}

/** Hierarchy focus first: Control+Z in a text field would undo the field, not the scene. */
async function pressHistory(page, keys) {
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: /Spot$/ }).focus()
  await page.keyboard.press(keys)
  await settleShadowFrame(page)
}

const savedSpot = (angle, mapSize) => (scene) => {
  const props = spotProps(scene)
  return props.angle === angle && props.shadowMapSize === mapSize
}

async function assertSpotShadow(page, expected) {
  const state = await spotRuntimeState(page)
  assert.equal(state.requestedMapSize, expected.requested)
  assert.equal(state.effective.enabled, true)
  assert.equal(state.effective.mapSize, expected.effective)
  assert.equal(state.effective.maxDistance, 9, 'the Spot shadow range is its distance 9, below the scene 40')
  assert.deepEqual(state.nativeMapSize, [expected.effective, expected.effective])
  assert.equal(state.castShadow, true)
  return state
}

/**
 * Edits the Spot through the inspector: its angle, then one shadow override.
 * Each edit is its own undo step (they have distinct keys, so they never
 * coalesce), and the inherit-then-undo round trip never leaves two edits of
 * the same key within the history's coalescing window.
 */
async function editSpot(context) {
  const { page } = context
  assert.deepEqual(spotProps(await readShadowScene(page)), SPOT_PROPS, 'the saved Spot starts as authored')
  const initial = await assertSpotCone(page, 30)
  await assertSpotShadow(page, { requested: 512, effective: 512 })
  await shadowUiCapture(context, 'spot-cone-angle30')

  context.stage = 'Spot:angle30->50'
  await spotAngle(page, 50)
  await waitShadowSaved(page, savedSpot(50, 512), 'Spot angle 50')
  await assertSameShadowGame(page, true)
  const wide = await assertSpotCone(page, 50)
  await shadowUiCapture(context, 'spot-cone-angle50')

  context.stage = 'Spot:map512->inherit'
  await openShadowAdvanced(page)
  const group = page.getByRole('group', { name: 'Shadow map size', exact: true })
  await group.getByRole('button', { name: 'Inherit scene for Shadow map size', exact: true }).click()
  await waitShadowSaved(page, savedSpot(50, null), 'Spot map inherited')
  await assertSameShadowGame(page, true)
  const inherited = await assertSpotShadow(page, { requested: null, effective: 1024 })
  assert.match(await group.innerText(), /Inherited from scene.*Effective: 1024/s, 'the Spot profile at Medium is 1024, half the Sun')
  await shadowUiCapture(context, 'spot-map-inherited1024')
  await pressHistory(page, 'Control+z')
  await waitShadowSaved(page, savedSpot(50, 512), 'undo inherit')
  await assertSpotShadow(page, { requested: 512, effective: 512 })
  await page.evaluate(() => { globalThis.__waicaShadowObservedGame = globalThis.__waicaEditor.viewportGame() })

  context.stage = 'Spot:map512->2048'
  await openShadowAdvanced(page)
  await group.getByRole('combobox', { name: 'Shadow map size', exact: true }).selectOption('2048')
  await waitShadowSaved(page, savedSpot(50, 2048), 'Spot map 2048')
  await assertSameShadowGame(page, true)
  const override = await assertSpotShadow(page, { requested: 2048, effective: 2048 })
  await shadowUiCapture(context, 'spot-map-override2048')
  return { initial, wide, inherited, override }
}

/** Undo and redo walk the angle and the override, each landing on the exact saved JSON and runtime. */
async function spotHistory(context) {
  const { page } = context
  context.stage = 'Spot:history'
  await pressHistory(page, 'Control+z')
  await waitShadowSaved(page, savedSpot(50, 512), 'undo map')
  const undoMap = await assertSpotShadow(page, { requested: 512, effective: 512 })
  await pressHistory(page, 'Control+z')
  const saved = await waitShadowSaved(page, savedSpot(30, 512), 'undo angle')
  assert.deepEqual(spotProps(saved), SPOT_PROPS, 'undoing every edit must restore the authored Spot exactly')
  const undone = await assertSpotCone(page, 30)
  await pressHistory(page, 'Control+Shift+z')
  await waitShadowSaved(page, savedSpot(50, 512), 'redo angle')
  await pressHistory(page, 'Control+Shift+z')
  await waitShadowSaved(page, savedSpot(50, 2048), 'redo map')
  const redoMap = await assertSpotShadow(page, { requested: 2048, effective: 2048 })
  const redone = await assertSpotCone(page, 50)
  // History rebuilds the stage; whatever follows observes the new Game.
  await page.evaluate(() => { globalThis.__waicaShadowObservedGame = globalThis.__waicaEditor.viewportGame() })
  return { undoMap, undone, redoMap, redone }
}

async function spotHelpersToggle(context) {
  const { page } = context
  await setShadowToggle(page, 'Show helpers', false)
  const hidden = await spotCones(page)
  assert.deepEqual(hidden.map((cone) => cone.visible), [false], 'the helpers toggle hides the cone')
  await setShadowToggle(page, 'Show helpers', true)
  await assertSpotCone(page, 50)
  return hidden
}

async function spotPlay(context) {
  const { page } = context
  const authored = await readShadowScene(page)
  await page.getByRole('button', { name: '▶ Play', exact: true }).click()
  await page.getByRole('button', { name: '⏹ Stop', exact: true }).waitFor()
  await page.waitForFunction(() => globalThis.__waicaEditor.viewportGame()?.find('Spot') !== undefined)
  await settleShadowFrame(page)
  assert.deepEqual(await spotCones(page), [], 'Play must contain no spot cone object, not merely an invisible one')
  assert.deepEqual((await shadowHelperState(page)).editorObjectNames, [])
  await page.getByRole('button', { name: '⏹ Stop', exact: true }).click()
  await page.getByRole('button', { name: '▶ Play', exact: true }).waitFor()
  await settleShadowFrame(page)
  await selectShadowEntity(page, 'Spot')
  const back = await assertSpotCone(page, 50)
  assert.deepEqual(await readShadowScene(page), authored, 'Play/Stop must not alter the saved Spot')
  return back
}

async function spotLightFlow(context) {
  const { page } = context
  // Earlier history steps rebuilt the stage: from here on, only the Spot's own edits may not.
  await page.evaluate(() => { globalThis.__waicaShadowObservedGame = globalThis.__waicaEditor.viewportGame() })
  await setShadowToggle(page, 'Show helpers', true)
  await selectShadowEntity(page, 'Spot')
  const selected = await assertVisibleCoverage(page, 'spot')
  const edits = await editSpot(context)
  const history = await spotHistory(context)
  const toggle = await spotHelpersToggle(context)
  const coverage = await assertVisibleCoverage(page, 'spot')
  await shadowUiCapture(context, 'selected-spot-cone-and-coverage')
  const play = await spotPlay(context)
  return { selected, edits, history, toggle, coverage, play }
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
  const spot = await spotLightFlow(context)
  const globalOff = await globalOffCoverage(context)
  const play = await playWithoutCoverage(context)
  return { selectedSun, visibility, orbit, point, spot, globalOff, ...play }
}
