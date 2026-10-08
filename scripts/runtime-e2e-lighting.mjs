// Issue #78 (CA-8, CA-15): the isometric demo's dungeon, drawn through a real
// Render Backend. Each variant is its own paused Run Session of one generated
// demo Project, stepped to the same frame and screenshotted; the decoded RGBA
// is sampled at logical points projected to the screen.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The frame every variant is captured at, as the Sprite Batch parity leg does. */
const FRAME = 13
/**
 * Per-channel tolerance for "behind every wall matches the ambient-only
 * value": both frames draw the same Ambient Light there, so any difference is
 * the light-map's 8-bit accumulation (inference 14). Measured values are
 * printed with the leg's result.
 */
const SHADOW_TOLERANCE = 2
/**
 * How much the vignette must darken the floor's left tip (about 0.6 of the
 * way to a corner, past the dungeon's radius of 0.35) on a fully lit frame,
 * summed over RGB: a margin, not a tolerance.
 */
const VIGNETTE_MIN_DARKENING = 30

// The dungeon's fixed camera (packages/archetype-isometric/src/dungeon.ts):
// centred on render (0, -5), 12 units tall, on the demo's 640x360 canvas.
const CAMERA = { x: 0, y: -5, zoom: 12 }
const CANVAS = { width: 640, height: 360 }

/** A logical dungeon point as the screenshot pixel it lands on. */
export function dungeonPixel(lx, ly) {
  const scale = CANVAS.height / CAMERA.zoom
  const rx = lx - ly
  const ry = -(lx + ly) / 2
  return {
    x: Math.round(CANVAS.width / 2 + (rx - CAMERA.x) * scale),
    y: Math.round(CANVAS.height / 2 - (ry - CAMERA.y) * scale),
  }
}

/** Points of the shipped dungeon: lit between the torches, walled off from both, a flame, a corner and the centre. */
export const DUNGEON_SAMPLES = {
  lit: dungeonPixel(3.5, 4.5),
  shadowed: dungeonPixel(6.5, 4.5),
  // Torch-1 at (3.5, 2.5): its flame circle sits 0.3 + 0.45 / 2 units above the base.
  flame: (() => {
    const base = dungeonPixel(3.5, 2.5)
    return { x: base.x, y: Math.round(base.y - (0.3 + 0.45 / 2) * (CANVAS.height / CAMERA.zoom)) }
  })(),
  // The floor diamond's left tip, logical (0.5, 9.5): a wall tile, well lit at ambient 1.
  edge: dungeonPixel(0.5, 9.5),
  centre: { x: CANVAS.width / 2, y: CANVAS.height / 2 },
}

// Runs in the page, serialized by page.evaluate.
async function samplesInPage({ base64, points }) {
  const { data, width } = await globalThis.decodePng(base64)
  return Object.fromEntries(Object.entries(points).map(([name, { x, y }]) => {
    const index = (y * width + x) * 4
    return [name, [data[index], data[index + 1], data[index + 2], data[index + 3]]]
  }))
}

// Runs in the page: whether every pixel is opaque white, the CI WebGPU symptom.
async function allWhiteInPage({ base64 }) {
  const { data } = await globalThis.decodePng(base64)
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] !== 255 || data[index + 1] !== 255 || data[index + 2] !== 255) return false
  }
  return true
}

/**
 * Expected failure, narrowly (PR #150, https://github.com/chichex/waica/issues/151):
 * on CI's headless Linux WebGPU every lighting/post frame comes out blank —
 * no failed step, no page error — while the webgl2 leg and every local run
 * draw it. Only there, only for the dungeon frames and the two diagnostic
 * variants, the leg asserts they are still blank and fails the moment they
 * render, so the fix removes this exception. This relaxes the #140 grill's
 * decision 10 (a WebGPU leg never skips) for these samples alone: main lit
 * at Ambient Light 1, the snapshot and every other webgpu assertion stay
 * required.
 */
export function expectsBlankLighting(renderBackend, env = process.env, platform = process.platform) {
  return renderBackend === 'webgpu' && Boolean(env.CI) && platform === 'linux'
}

/** Whether every sample is opaque white: the CI symptom of issue #151. */
const blankSamples = (samples) => Object.values(samples).every((pixel) => pixel[0] === 255 && pixel[1] === 255 && pixel[2] === 255)

const brightness = (pixel) => pixel[0] + pixel[1] + pixel[2]
const maxChannelDifference = (a, b) => Math.max(...[0, 1, 2].map((channel) => Math.abs(a[channel] - b[channel])))

async function rewriteScene(project, name, edit) {
  const file = path.join(project, `src/scenes/${name}.scene.json`)
  const original = await readFile(file, 'utf8')
  const scene = JSON.parse(original)
  edit(scene)
  await writeFile(file, `${JSON.stringify(scene, null, 2)}\n`)
  return () => writeFile(file, original)
}

/**
 * The page's console errors so far, for failure messages only: a scene
 * operation naming no scene fails without stepping or changing the live
 * scene, and its diagnostics carry them.
 */
async function browserErrors(call, client, project) {
  const probe = await call(client, 'control_runtime', { project_path: project, operation: 'scene', scene: '-waica-diagnostics-' })
  return probe.structuredContent?.error?.diagnostics?.browserErrors ?? []
}

/** One paused Run Session: load `scene`, step to FRAME, screenshot, snapshot, stop. */
async function capture({ helpers, client, project, chrome, scene }) {
  const { call, assertScreenshot, assertUrlClosed } = helpers
  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `start_project failed: ${JSON.stringify(start)}`)
  try {
    if (scene !== 'main') {
      const swapped = await call(client, 'control_runtime', { project_path: project, operation: 'scene', scene })
      assert.equal(swapped.isError, undefined, `scene:'${scene}' failed: ${JSON.stringify(swapped)}`)
    }
    const stepped = await call(client, 'control_runtime', { project_path: project, operation: 'step', frames: FRAME })
    // A step that threw leaves the canvas undrawn: say why instead of sampling an empty frame.
    assert.equal(stepped.isError, undefined, `step in '${scene}' failed: ${JSON.stringify(stepped.structuredContent ?? stepped.content)}`)
    const shot = assertScreenshot(await call(client, 'capture_screenshot', { project_path: project }), 'paused', CANVAS)
    const inspected = await call(client, 'inspect_runtime', { project_path: project, entity_names: ['nobody'] })
    return { image: shot.image, snapshot: inspected.structuredContent.snapshot, browserErrors: await browserErrors(call, client, project) }
  } finally {
    const stopped = await call(client, 'stop_project', { project_path: project })
    assert.equal(stopped.structuredContent.stopped, true)
    await assertUrlClosed(start.structuredContent.url)
  }
}

/** CA-8: main with Ambient Light 1 and no light draws exactly the unlit main. */
async function ambientOneParity({ helpers, client, project, chrome, inspector, label }) {
  const unlit = await capture({ helpers, client, project, chrome, scene: 'main' })
  const restore = await rewriteScene(project, 'main', (scene) => {
    scene.render = { ...scene.render, lighting: { ambient: { intensity: 1 } } }
  })
  const lit = await capture({ helpers, client, project, chrome, scene: 'main' }).finally(restore)
  await helpers.keepScreenshot(`${label}-main-ambient-1.png`, lit.image)
  assert.equal(lit.snapshot.lighting.ambient.intensity, 1)
  const compared = await inspector.compare(lit.image, unlit.image)
  assert.ok(compared.varied, 'the main screenshot must show a scene, not one flat color')
  assert.equal(compared.differing, 0, `lit main at ambient 1 must equal unlit main pixel for pixel; ${JSON.stringify(compared)}`)
  return compared.differing
}

/** The dungeon and the variants each CA-15 assertion compares it with. */
async function dungeonVariants({ helpers, client, project, chrome }) {
  const variant = async (edit) => {
    const restore = await rewriteScene(project, 'dungeon', edit)
    return capture({ helpers, client, project, chrome, scene: 'dungeon' }).finally(restore)
  }
  const torchesOff = (scene) => {
    for (const entity of scene.entities) {
      if (entity.prefab === 'objects/torch') entity.overrides = { ...entity.overrides, Light: { intensity: 0 } }
    }
  }
  return {
    shipped: await capture({ helpers, client, project, chrome, scene: 'dungeon' }),
    ambientOnly: await variant(torchesOff),
    fullAmbient: await variant((scene) => {
      scene.render.lighting = { ambient: { intensity: 1 } }
    }),
    // Same Post Effect pipeline, vignette at zero: only the darkening differs.
    // Fully lit, same Post Effect pipeline with the vignette at zero: only the darkening differs.
    fullAmbientNoVignette: await variant((scene) => {
      scene.render.lighting = { ambient: { intensity: 1 } }
      scene.render.post = { vignette: { ...scene.render.post.vignette, intensity: 0 } }
    }),
  }
}

function assertDungeonSnapshot(snapshot) {
  assert.equal(snapshot.scene, 'dungeon')
  assert.deepEqual(snapshot.lighting.lights.map((light) => light.entity), ['Torch-1', 'Torch-2'])
  assert.deepEqual(
    snapshot.lighting.lights.map(({ x, y, radius }) => ({ x, y, radius })),
    [{ x: 3.5, y: 2.5, radius: 4.5 }, { x: 3.5, y: 6.5, radius: 4.5 }],
  )
  assert.ok(snapshot.lighting.ambient.intensity < 0.5, 'the dungeon is dark')
  assert.deepEqual(snapshot.post, { vignette: { intensity: 0.45, radius: 0.35 }, colorGrade: null })
}

/**
 * CA-15: near a torch is brighter than the ambient-only frame; behind the
 * wall from both torches it matches it; the Emissive flame ignores the
 * Ambient Light; the vignette darkens a corner and leaves the centre.
 */
async function dungeonAssertions({ helpers, client, project, chrome, inspector, label }) {
  const frames = await dungeonVariants({ helpers, client, project, chrome })
  for (const [name, frame] of Object.entries(frames)) await helpers.keepScreenshot(`${label}-dungeon-${name}.png`, frame.image)
  assertDungeonSnapshot(frames.shipped.snapshot)
  const sample = (frame) => inspector.evaluate(samplesInPage, { base64: frame.image, points: DUNGEON_SAMPLES })
  const [shipped, ambientOnly, fullAmbient, fullAmbientNoVignette] = await Promise.all(
    [frames.shipped, frames.ambientOnly, frames.fullAmbient, frames.fullAmbientNoVignette].map(sample),
  )
  const measured = {
    litOverAmbient: brightness(shipped.lit) - brightness(ambientOnly.lit),
    shadowDifference: maxChannelDifference(shipped.shadowed, ambientOnly.shadowed),
    flameDifference: maxChannelDifference(shipped.flame, fullAmbient.flame),
    edgeDarkening: brightness(fullAmbientNoVignette.edge) - brightness(fullAmbient.edge),
    centreDifference: maxChannelDifference(fullAmbientNoVignette.centre, fullAmbient.centre),
    samples: { shipped, ambientOnly, fullAmbient, fullAmbientNoVignette },
    browserErrors: [...new Set(Object.values(frames).flatMap((frame) => frame.browserErrors))].slice(0, 10),
  }
  const detail = JSON.stringify(measured)
  assert.ok(measured.litOverAmbient > 0, `a point near a torch must be brighter than the ambient-only frame; ${detail}`)
  assert.ok(measured.shadowDifference <= SHADOW_TOLERANCE, `behind the wall must match the ambient-only frame within ${SHADOW_TOLERANCE}; ${detail}`)
  assert.equal(measured.flameDifference, 0, `the Emissive flame must not change with the Ambient Light; ${detail}`)
  assert.ok(measured.edgeDarkening >= VIGNETTE_MIN_DARKENING, `the vignette must darken towards a corner; ${detail}`)
  assert.ok(measured.centreDifference <= SHADOW_TOLERANCE, `the vignette must leave the centre; ${detail}`)
  return measured
}

/**
 * Diagnostic, not an assertion (PR #150): on CI's headless WebGPU every
 * dungeon frame came out blank. Two variants split the suspects — main with
 * a vignette and no Light (the Post Effect path alone), and the dungeon with
 * no Post Effect (its Lights and occlusion alone) — and each reports the
 * same sample points plus whether the whole frame is white. Printed at once,
 * so a later failure in the leg cannot hide it.
 */
async function postDiagnostics({ helpers, client, project, chrome, inspector, label }) {
  const variant = async (name, scene, edit) => {
    const restore = await rewriteScene(project, scene, edit)
    const frame = await capture({ helpers, client, project, chrome, scene }).finally(restore)
    await helpers.keepScreenshot(`${label}-diagnostic-${name}.png`, frame.image)
    return {
      allWhite: await inspector.evaluate(allWhiteInPage, { base64: frame.image }),
      samples: await inspector.evaluate(samplesInPage, { base64: frame.image, points: DUNGEON_SAMPLES }),
      browserErrors: frame.browserErrors,
    }
  }
  const diagnostics = {
    mainWithVignette: await variant('main-vignette', 'main', (scene) => {
      scene.render = { ...scene.render, post: { vignette: { intensity: 0.45, radius: 0.35 } } }
    }),
    dungeonWithoutPost: await variant('dungeon-no-post', 'dungeon', (scene) => {
      delete scene.render.post
    }),
  }
  console.log(`waica lighting diagnostics (${label}): ${JSON.stringify(diagnostics)}`)
  return diagnostics
}

/** Issue #151's expected failure: the snapshot still holds, and every lighting/post frame must still be blank. */
async function expectedBlankDungeon({ helpers, client, project, chrome, inspector, label, diagnostics }) {
  const frames = await dungeonVariants({ helpers, client, project, chrome })
  for (const [name, frame] of Object.entries(frames)) await helpers.keepScreenshot(`${label}-dungeon-${name}.png`, frame.image)
  assertDungeonSnapshot(frames.shipped.snapshot)
  const samples = {
    ...Object.fromEntries(await Promise.all(Object.entries(frames).map(async ([name, frame]) =>
      [name, await inspector.evaluate(samplesInPage, { base64: frame.image, points: DUNGEON_SAMPLES })]))),
    mainWithVignette: diagnostics.mainWithVignette.samples,
    dungeonWithoutPost: diagnostics.dungeonWithoutPost.samples,
  }
  const rendering = Object.entries(samples).filter(([, frame]) => !blankSamples(frame)).map(([name]) => name)
  assert.deepEqual(
    rendering,
    [],
    `issue #151 is fixed for ${rendering.join(', ')}: these frames now render on CI's Linux WebGPU, so remove expectsBlankLighting's exception and let the CA-15 assertions run; ${JSON.stringify(samples)}`,
  )
  return { expectedBlank: 'https://github.com/chichex/waica/issues/151', samples }
}

/** The whole lighting leg; `helpers` are runtime-e2e.mjs's own. */
export async function runLightingLeg({ client, root, parent, chrome, viteBin, engineRoot, playwright, label, helpers, renderBackend }) {
  const project = await helpers.makeDemoProject({
    client, root, parent, viteBin, engineRoot, archetype: 'isometric', name: 'waica-lighting',
  })
  const inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
  try {
    const ambientOneDifferingPixels = await ambientOneParity({ helpers, client, project, chrome, inspector, label })
    const diagnostics = await postDiagnostics({ helpers, client, project, chrome, inspector, label })
    const dungeon = expectsBlankLighting(renderBackend)
      ? await expectedBlankDungeon({ helpers, client, project, chrome, inspector, label, diagnostics })
      : await dungeonAssertions({ helpers, client, project, chrome, inspector, label })
    return { lighting: { ambientOneDifferingPixels, diagnostics, dungeon } }
  } finally {
    await inspector.close()
  }
}
