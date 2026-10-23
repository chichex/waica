// CA-15: third-person MemFS project, with only its main scene replaced by an
// opaque pixel oracle. All authoring changes after opening go through the UI.
import assert from 'node:assert/strict'

export const SHADOW_SCENE_PATH = 'src/scenes/main.scene.json'
export const SHADOW_SUN_PATH = 'src/objects/shadow-sun.object.json'
const PROJECT = 'waica-editor-shadows'

export function shadowProjectFiles(files) {
  const scene = {
    waicaScene: 3,
    render: { space: '3d', shadows: { quality: 'medium', maxDistance: 40 }, lighting: { ambient: { color: '#ffffff', intensity: 0.15 } } },
    camera: { kind: 'perspective', position: [6, 5, 8], target: [0, 0, 0], fov: 50 },
    entities: [
      { name: 'Ground', components: [{ type: 'Model', props: { shape: 'plane', size: 20, castShadows: false } }] },
      { name: 'Caster', position: [0, 1, 0], components: [{ type: 'Model', props: { shape: 'box', size: 2 } }] },
      { name: 'Sun', prefab: 'objects/shadow-sun', overrides: { Sun: { shadowMapSize: 512 } } },
      { name: 'Point', position: [-3, 2, 0], components: [{ type: 'PointLight', props: { intensity: 0, distance: 9, shadowMaxDistance: 2 } }] },
    ],
  }
  const prefab = { waicaPrefab: 1, type: 'object', components: [{ type: 'Sun', props: { direction: [1, -2, 1], intensity: 2, shadowMapSize: 1024 } }] }
  return { ...files, [SHADOW_SCENE_PATH]: JSON.stringify(scene, null, 2), [SHADOW_SUN_PATH]: JSON.stringify(prefab, null, 2) }
}

export async function openShadowProject(page, files) {
  await page.waitForFunction(() => globalThis.__waicaEditor !== undefined)
  await page.evaluate(({ project, scenePath }) => {
    globalThis.localStorage.setItem(`waica:workspace:${project}`, JSON.stringify({ waicaWorkspace: 1, openScenePath: scenePath, view: { kind: 'scene', path: scenePath } }))
  }, { project: PROJECT, scenePath: SHADOW_SCENE_PATH })
  await page.evaluate(({ project, files }) => globalThis.__waicaEditor.openMemoryProject(project, files), { project: PROJECT, files })
  await page.waitForFunction(() => {
    const game = globalThis.__waicaEditor.viewportGame()
    return game?.backend && game.find('Caster') && game.find('Point') && game.find('Sun')
  }, null, { timeout: 30_000 })
  await settleShadowFrame(page)
}

export async function settleShadowFrame(page) {
  await page.evaluate(() => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))))
}

export async function readShadowScene(page) {
  const text = await page.evaluate((path) => globalThis.__waicaEditor.readText(path), SHADOW_SCENE_PATH)
  assert.ok(text, 'the MemFS scene must exist')
  return JSON.parse(text)
}

export async function waitShadowSaved(page, check, description) {
  const deadline = Date.now() + 10_000
  let scene
  while (Date.now() < deadline) {
    scene = await readShadowScene(page)
    if (check(scene)) return scene
    await page.waitForTimeout(100)
  }
  throw new Error(`${description}: saved JSON did not converge: ${JSON.stringify(scene)}`)
}

export const sunOverrides = (scene) => scene.entities.find((entity) => entity.name === 'Sun').overrides?.Sun ?? {}

export async function selectShadowEntity(page, name) {
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: new RegExp(`^[^A-Za-z]*${name}$`) }).click()
  assert.equal(await page.getByRole('textbox', { name: 'name', exact: true }).inputValue(), name)
  await settleShadowFrame(page)
}

export async function showShadowSceneInspector(page) {
  await page.locator('.ed-x-subtree button.ed-x-item').filter({ hasText: /Caster$/ }).focus()
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: 'Shadow quality', exact: true }).waitFor()
}

export async function setShadowToggle(page, title, enabled) {
  const button = page.getByTitle(title, { exact: true })
  if ((await button.getAttribute('aria-pressed')) !== String(enabled)) await button.click()
  await settleShadowFrame(page)
}

// Read-only observation: neither runtime settings nor the editor's setters are called here.
export async function shadowRuntimeState(page) {
  return page.evaluate(() => {
    const game = globalThis.__waicaEditor.viewportGame()
    const light = (name, type) => {
      const component = game.find(name).components.find((item) => item.constructor.componentName === type)
      return { requested: Object.fromEntries(['shadowMapSize', 'shadowMaxDistance', 'shadowBias', 'shadowNormalBias', 'shadowRadius'].map((key) => [key, component[key]])), effective: game.shadows.resolve(component), nativeMapSize: component.light.shadow.mapSize.toArray(), castShadow: component.light.castShadow }
    }
    return { backend: game.backend, policy: game.shadows.policy, sun: light('Sun', 'Sun'), point: light('Point', 'PointLight') }
  })
}
