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
  corner: { x: 4, y: 4 },
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
    await call(client, 'control_runtime', { project_path: project, operation: 'step', frames: FRAME })
    const shot = assertScreenshot(await call(client, 'capture_screenshot', { project_path: project }), 'paused', CANVAS)
    const inspected = await call(client, 'inspect_runtime', { project_path: project, entity_names: ['nobody'] })
    return { image: shot.image, snapshot: inspected.structuredContent.snapshot }
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
    noVignette: await variant((scene) => {
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
  const [shipped, ambientOnly, fullAmbient, noVignette] = await Promise.all(
    [frames.shipped, frames.ambientOnly, frames.fullAmbient, frames.noVignette].map(sample),
  )
  const measured = {
    litOverAmbient: brightness(shipped.lit) - brightness(ambientOnly.lit),
    shadowDifference: maxChannelDifference(shipped.shadowed, ambientOnly.shadowed),
    flameDifference: maxChannelDifference(shipped.flame, fullAmbient.flame),
    cornerDarkening: brightness(noVignette.corner) - brightness(shipped.corner),
    centreDifference: maxChannelDifference(noVignette.centre, shipped.centre),
    samples: { shipped, ambientOnly, fullAmbient, noVignette },
  }
  const detail = JSON.stringify(measured)
  assert.ok(measured.litOverAmbient > 0, `a point near a torch must be brighter than the ambient-only frame; ${detail}`)
  assert.ok(measured.shadowDifference <= SHADOW_TOLERANCE, `behind the wall must match the ambient-only frame within ${SHADOW_TOLERANCE}; ${detail}`)
  assert.equal(measured.flameDifference, 0, `the Emissive flame must not change with the Ambient Light; ${detail}`)
  assert.ok(measured.cornerDarkening > 0, `the vignette must darken a corner; ${detail}`)
  assert.ok(measured.centreDifference <= SHADOW_TOLERANCE, `the vignette must leave the centre; ${detail}`)
  return measured
}

/** The whole lighting leg; `helpers` are runtime-e2e.mjs's own. */
export async function runLightingLeg({ client, root, parent, chrome, viteBin, engineRoot, playwright, label, helpers }) {
  const project = await helpers.makeDemoProject({
    client, root, parent, viteBin, engineRoot, archetype: 'isometric', name: 'waica-lighting',
  })
  const inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
  try {
    const ambientOneDifferingPixels = await ambientOneParity({ helpers, client, project, chrome, inspector, label })
    const dungeon = await dungeonAssertions({ helpers, client, project, chrome, inspector, label })
    return { lighting: { ambientOneDifferingPixels, dungeon } }
  } finally {
    await inspector.close()
  }
}
