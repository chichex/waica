// The editor-3d leg of the runtime e2e (issue #173 CA-23, moved to the
// third-person demo by issue #181 CA-35): the editor's own Vite dev server, a
// real Chrome on the leg's Render Backend, and examples/third-person's project
// (the archetype's demo courtyard, its prefabs, UI and glbs) opened as an
// in-memory project through the DEV-only `globalThis.__waicaEditor` hook. It clicks the Knight to select it,
// drags the gizmo's X arrow with the real mouse, undoes the drag, reads the
// Animator's clip dropdown, and orbits with a middle drag, all checked in the
// file the editor saves. Pixels are compared only where the frame draws (not
// on CI's Linux WebGPU, issue #151).
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expectsBlankLighting } from './runtime-e2e-lighting.mjs'
import { runEditorShadowsFlow } from './runtime-e2e-editor-shadows.mjs'

/** The third-person example's sources: a synced copy of the archetype's demo (scripts/sync-scene.mjs). */
const EXAMPLE = fileURLToPath(new URL('../examples/third-person/src', import.meta.url))
const PROJECT = 'waica-editor-3d'
const SCENE_PATH = 'src/scenes/main.scene.json'
const VIEWPORT = { width: 1280, height: 800 }
/** The Knight's clips the Animator's initial-clip select must offer (among others). */
const KNIGHT_CLIPS = ['Idle', 'Walking_A', 'Jump_Start']
/** The gizmo drag and the orbit drag, in CSS px. */
const DRAG_PX = 100
const ORBIT_PX = 120
const MIN_DIFFERING_PIXELS = 50
/** Longer than the editor's 600 ms save debounce, with margin. */
const SAVE_SETTLE_MS = 1500

/** A port nothing listens on, for the editor's dev server. */
async function freePort() {
  const server = createNetServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** The editor's Vite dev server (its own vite.config: React, the bare-three alias), on a free port. */
async function startEditor({ root, viteBin }) {
  const viteRoot = path.dirname(path.dirname(viteBin))
  const { createServer } = await import(pathToFileURL(path.join(viteRoot, 'dist/node/index.js')).href)
  const port = await freePort()
  const server = await createServer({ root: path.join(root, 'packages/editor'), logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } })
  await server.listen()
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() }
}

/** The file extensions the in-memory project receives as text. */
const TEXT_FILES = new Set(['.json', '.html', '.css'])

/** The in-memory project: the example's JSON, UI pieces and glbs (base64), under src/ as a generated project holds them; not its code. */
async function projectFiles() {
  const files = {}
  for (const entry of await readdir(EXAMPLE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith('.ts')) continue
    const file = path.join(entry.parentPath, entry.name)
    const key = `src/${path.relative(EXAMPLE, file).split(path.sep).join('/')}`
    // Only known text formats go as text: any other file (a glb, a png, audio, a .bin) goes as base64, so its bytes survive.
    files[key] = TEXT_FILES.has(path.extname(entry.name)) ? await readFile(file, 'utf8') : { base64: (await readFile(file)).toString('base64') }
  }
  return files
}

/** The scene as the editor saved it. */
async function savedScene(page) {
  const text = await page.evaluate((scenePath) => globalThis.__waicaEditor.readText(scenePath), SCENE_PATH)
  assert.ok(text, `the editor's project has no ${SCENE_PATH}`)
  return JSON.parse(text)
}

const playerOf = (scene) => scene.entities.find((entity) => entity.name === 'Player')

/** Polls the saved scene until `check` holds (the editor writes on a debounce). */
async function waitForSaved(page, check, what) {
  const deadline = Date.now() + 10_000
  let last
  while (Date.now() < deadline) {
    last = await savedScene(page)
    if (check(last)) return last
    await page.waitForTimeout(100)
  }
  throw new Error(`the saved scene never showed ${what}; last: ${JSON.stringify(playerOf(last)?.position)}`)
}

/** Opens the project at its main scene and waits for the live 3D Game with the Knight's glb loaded. */
async function openProject(page, files) {
  await page.waitForFunction(() => globalThis.__waicaEditor !== undefined, null, { timeout: 30_000 })
  await page.evaluate(
    ({ project, scenePath }) => globalThis.localStorage.setItem(`waica:workspace:${project}`, JSON.stringify({ waicaWorkspace: 1, openScenePath: scenePath, view: { kind: 'scene', path: scenePath } })),
    { project: PROJECT, scenePath: SCENE_PATH },
  )
  await page.evaluate(({ project, files }) => globalThis.__waicaEditor.openMemoryProject(project, files), { project: PROJECT, files })
  // The Knight's glb hangs under its Model's root once loaded and placed: before that a click meets the ground.
  await page.waitForFunction(
    () => {
      const game = globalThis.__waicaEditor.viewportGame()
      const player = game?.find('Player')
      return game?.space === '3d' && player?.components.some((component) => component.constructor.componentName === 'Model' && component.root?.children.length > 0)
    },
    null,
    { timeout: 30_000 },
  )
  await page.evaluate(() => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))))
}

/** Where a world point is drawn, in page px. */
async function pagePoint(page, world) {
  const at = await page.evaluate((point) => globalThis.__waicaEditor.viewportGame().worldToScreen(point), world)
  assert.ok(at, `world point ${JSON.stringify(world)} is not in view`)
  const box = await page.locator('.ed-viewport canvas').boundingBox()
  return { x: box.x + at.x, y: box.y + at.y }
}

/** Clicks the Knight's body and checks the Inspector shows the Player. */
async function selectKnight(page) {
  const [x, y, z] = playerOf(await savedScene(page)).position
  const at = await pagePoint(page, { x, y: y + 0.9, z })
  await page.mouse.click(at.x, at.y)
  const name = page.getByRole('textbox', { name: 'name', exact: true })
  const deadline = Date.now() + 10_000
  while (!((await name.count()) > 0 && (await name.first().inputValue()) === 'Player')) {
    assert.ok(Date.now() < deadline, 'a click on the Knight must show the Player in the Inspector')
    await page.waitForTimeout(100)
  }
}

/** The page points of the gizmo's X arrow handle and of a point 100 px further along the drawn X axis. */
async function xArrow(page) {
  const world = await page.evaluate(() => {
    const game = globalThis.__waicaEditor.viewportGame()
    const helper = game.scene.children.find((child) => child.name === 'waica:editor-gizmo')
    const handle = helper.controls._gizmo.picker.translate.children.find((child) => child.name === 'X')
    handle.updateWorldMatrix(true, false)
    // TransformControls offsets a handle's geometry, not the mesh: its middle is the geometry's.
    handle.geometry.computeBoundingBox()
    const at = handle.geometry.boundingBox.getCenter(helper.controls.worldPosition.clone()).applyMatrix4(handle.matrixWorld)
    const pivot = helper.controls.object.position
    return { handle: { x: at.x, y: at.y, z: at.z }, pivot: { x: pivot.x, y: pivot.y, z: pivot.z } }
  })
  const handle = await pagePoint(page, world.handle)
  const pivot = await pagePoint(page, world.pivot)
  const length = Math.hypot(handle.x - pivot.x, handle.y - pivot.y)
  assert.ok(length > 5, `the X arrow must be drawn away from the pivot; ${JSON.stringify({ handle, pivot })}`)
  return { from: handle, to: { x: handle.x + ((handle.x - pivot.x) / length) * DRAG_PX, y: handle.y + ((handle.y - pivot.y) / length) * DRAG_PX } }
}

/** W, then the X arrow dragged 100 px with the real mouse: x moves, y and z do not; one Ctrl+Z restores it. */
async function dragAndUndo(page) {
  const before = playerOf(await savedScene(page)).position
  await page.keyboard.press('w')
  const { from, to } = await xArrow(page)
  await page.mouse.move(from.x, from.y, { steps: 4 })
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  const moved = playerOf(await waitForSaved(page, (scene) => playerOf(scene).position[0] !== before[0], 'the Player moved along x')).position
  assert.equal(moved[1], before[1], `the X drag must leave y; ${JSON.stringify({ before, moved })}`)
  assert.equal(moved[2], before[2], `the X drag must leave z; ${JSON.stringify({ before, moved })}`)
  await page.keyboard.press('Control+z')
  await waitForSaved(page, (scene) => JSON.stringify(playerOf(scene).position) === JSON.stringify(before), 'the Player back where it was')
  return { before, moved }
}

/** The Animator's initial-clip select lists the Knight's clips. */
async function clipOptions(page) {
  const select = page.getByRole('combobox', { name: 'Initial clip' })
  await select.waitFor({ timeout: 10_000 })
  const options = await select.locator('option').allTextContents()
  for (const clip of KNIGHT_CLIPS) assert.ok(options.includes(clip), `the initial-clip select must offer ${clip}; ${JSON.stringify(options)}`)
  return options
}

/** A middle drag moves the Editor Camera and leaves the scene's camera block as it was. */
async function orbit(page) {
  const camera = () => page.evaluate(() => globalThis.__waicaEditor.viewportGame().camera.position.toArray())
  const sceneCamera = JSON.stringify((await savedScene(page)).camera)
  const before = await camera()
  const box = await page.locator('.ed-viewport canvas').boundingBox()
  const start = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.6 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(start.x + ORBIT_PX, start.y - 20, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  const after = await camera()
  assert.notDeepEqual(after, before, 'a middle drag must move the editor camera')
  // Every editor write is debounced by WRITE_DELAY_MS (600 ms, write-scheduler.ts): wait well past it, or a camera write would land after the read.
  await page.waitForTimeout(SAVE_SETTLE_MS)
  assert.equal(JSON.stringify((await savedScene(page)).camera), sceneCamera, "navigating must leave the scene's camera block alone")
  return { before, after }
}

/** Polls a project file the editor saves (on a debounce) until it exists; its text. */
async function savedText(page, filePath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const text = await page.evaluate((target) => globalThis.__waicaEditor.readText(target), filePath)
    if (text !== null) return text
    await page.waitForTimeout(100)
  }
  throw new Error(`the editor never saved ${filePath}`)
}

/**
 * The Explorer's New object writes, in this third-person project, the bytes
 * scaffold_prefab writes for an object in a fresh third-person project
 * (maintainer decision on issue #181: the editor's New prefab and the MCP
 * scaffold write the same 3D set).
 */
async function newObjectMatchesScaffold(page, { call, client, parent, label }) {
  const project = path.join(parent, `waica-editor-3d-scaffold-${label}`)
  const created = await call(client, 'create_project', { project_path: project, start: 'blank', archetype: 'third-person' })
  assert.equal(created.isError, undefined, `create_project failed: ${JSON.stringify(created)}`)
  const scaffolded = await call(client, 'scaffold_prefab', { project_path: project, name: 'crate', type: 'object' })
  assert.equal(scaffolded.isError, undefined, `scaffold_prefab failed: ${JSON.stringify(scaffolded)}`)
  const expected = await readFile(path.join(project, scaffolded.structuredContent.path), 'utf8')
  await page.getByTitle('New object').click()
  const written = await savedText(page, 'src/objects/object-1.object.json')
  assert.equal(written, expected, "the editor's New object must write scaffold_prefab's bytes")
  return { scaffold: scaffolded.structuredContent.path, bytes: written.length }
}

/** The canvas as a PNG (base64), after two frames so the last change is drawn. */
async function canvasShot(page) {
  await page.evaluate(() => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))))
  return (await page.locator('.ed-viewport canvas').screenshot()).toString('base64')
}

/** The whole editor-3d leg; `helpers` are runtime-e2e.mjs's own. */
export async function runEditor3dLeg({ root, viteBin, chrome, playwright, label, helpers, renderLeg, mcp }) {
  const startedAt = Date.now()
  let editor = null
  let browser = null
  let inspector = null
  const pageErrors = []
  try {
    editor = await startEditor({ root, viteBin })
    browser = await playwright.chromium.launch({ executablePath: chrome.executablePath, headless: true, args: renderLeg?.chromeArgs ?? [] })
    inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.goto(editor.url)
    await openProject(page, await projectFiles())
    await selectKnight(page)
    const drag = await dragAndUndo(page)
    const clips = await clipOptions(page)
    const beforeOrbit = await canvasShot(page)
    const camera = await orbit(page)
    const afterOrbit = await canvasShot(page)
    await helpers.keepScreenshot(`${label}-editor-3d-before-orbit.png`, beforeOrbit)
    await helpers.keepScreenshot(`${label}-editor-3d-after-orbit.png`, afterOrbit)
    const newPrefab = await newObjectMatchesScaffold(page, { ...mcp, label })
    // CA-15/18 stays strict on both backends, independently of legacy #151.
    const shadowFlow = async () => runEditorShadowsFlow({ root, page, files: await projectFiles(), inspector, chrome, label, helpers, renderLeg })
    // CI's Linux WebGPU draws a blank frame (issue #151): its pixels, and the page errors its backend raises, are only reported there.
    if (expectsBlankLighting(renderLeg?.backend)) {
      return { editorShadows: await shadowFlow(), editor3d: { durationMs: Date.now() - startedAt, drag, clips, camera, newPrefab, pageErrors, expectedBlank: 'https://github.com/chichex/waica/issues/151' } }
    }
    const { differing } = await inspector.compare(beforeOrbit, afterOrbit)
    assert.ok(differing >= MIN_DIFFERING_PIXELS, `orbiting must change at least ${MIN_DIFFERING_PIXELS} pixels where the frame draws; ${differing} did`)
    assert.deepEqual(pageErrors, [], 'the editor must raise no page error')
    return { editorShadows: await shadowFlow(), editor3d: { durationMs: Date.now() - startedAt, drag, clips, camera, newPrefab, differingAfterOrbit: differing } }
  } finally {
    // Each resource closes on its own, so one failing close leaves no other open.
    const closers = [inspector && (() => inspector.close()), browser && (() => browser.close()), editor && (() => editor.close())]
    const results = await Promise.allSettled(closers.filter(Boolean).map((close) => close()))
    for (const result of results) if (result.status === 'rejected') console.error(`editor-3d leg: a resource failed to close: ${String(result.reason)}`)
  }
}
