// Issue #181 CA-35, CA-36: the third-person demo leg, which replaced the 3D
// smoke leg of issues #154, #159 and #166. A generated `third-person` demo
// Project boots on the archetype's dungeon courtyard, through a real Render
// Backend. The leg asserts validate_project, the glbs loaded after a scene
// swap, the snapshot (the orbit camera's view, the Sun and the torches), the
// decoded pixels where the frame draws (the sky, the lit ground, a torch's
// warm pool and depth order), then plays the demo: the physics and the
// Animator, the camera-relative walk, the camera pulled in by a wall, a fight
// with a roll through a strike, and a respawn at a checkpoint.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CLIPS, clipDuration, poseHashOf } from './runtime-e2e-animation.mjs'
import { brightness, expectsBlankLighting, maxChannelDifference, rewriteScene, samplesInPage } from './runtime-e2e-lighting.mjs'
import { exerciseCombat, exerciseRespawn } from './runtime-e2e-third-person-combat.mjs'
import { exerciseCameraCollision, exerciseSimulation, SCENE } from './runtime-e2e-third-person-play.mjs'

/** The frame every variant is captured at, as the other screenshot legs do. */
const FRAME = 13
const CANVAS = { width: 640, height: 360 }
/** The Game's clear color (template main.ts): what shows above the courtyard's far wall. */
const BACKGROUND = [0x1a, 0x1a, 0x2e]
const BACKGROUND_TOLERANCE = 4
/** The demo's glbs (the Knight, the Skeleton Warrior and seven dungeon pieces), plus the Rapier module the 3D scene loads. */
const DEMO_ASSETS = 10

const warmth = (pixel) => pixel[0] - pixel[2]

/** Where world points land in the 640x360 screenshot, through the camera the snapshot reports. */
async function projector(view) {
  const { THREE, placePerspectiveCamera, resolvePerspectiveCamera, worldToNormalized } = await import('../packages/engine/dist/index.js')
  const camera = new THREE.PerspectiveCamera()
  const lens = resolvePerspectiveCamera({ kind: 'perspective', position: view.position, target: view.target, fov: view.fov })
  placePerspectiveCamera(camera, lens, CANVAS.width / CANVAS.height)
  return ([x, y, z]) => {
    const at = worldToNormalized(camera, { x, y, z })
    assert.ok(at, `the point ${x}, ${y}, ${z} must be in front of the camera`)
    return { x: Math.round(at.nx * CANVAS.width), y: Math.round(at.ny * CANVAS.height) }
  }
}

/** A red box between the camera and the Player, spawned first or last. */
const BLOCKER = { name: 'Blocker', position: [1, 1.5, 6.5], components: [{ type: 'Model', props: { shape: 'box', color: 0xff0000, size: 1.5 } }] }

/**
 * The pixels the leg reads: the sky above the far wall, the floor near the
 * Player, the floor under the north-west torch and a floor point out of every
 * torch's reach, and the blocker's centre.
 */
async function samplePoints(view) {
  const project = await projector(view)
  return {
    sky: { x: CANVAS.width / 2, y: Math.round(CANVAS.height * 0.03) },
    floor: project([2, 0, 6]),
    underTorch: project([-4, 0, -8.6]),
    farFromTorches: project([-8, 0, -1]),
    blocker: project(BLOCKER.position),
  }
}

/** One paused Run Session over the scene as `edit` leaves it: boot, reload the scene, step to FRAME, screenshot, snapshot. */
async function capture({ helpers, client, project, chrome, inspector }, edit) {
  const { call, assertScreenshot, assertUrlClosed } = helpers
  const restore = await rewriteScene(project, SCENE, edit)
  const start = await call(client, 'start_project', { project_path: project, browser_executable_path: chrome.executablePath, timeout_ms: 30_000 })
  try {
    assert.equal(start.isError, undefined, `start_project failed: ${JSON.stringify(start)}`)
    const swapped = await call(client, 'control_runtime', { project_path: project, operation: 'scene', scene: SCENE })
    assert.equal(swapped.isError, undefined, `scene:'${SCENE}' failed: ${JSON.stringify(swapped)}`)
    const stepped = await call(client, 'control_runtime', { project_path: project, operation: 'step', frames: FRAME })
    assert.equal(stepped.isError, undefined, `step in capture failed: ${JSON.stringify(stepped)}`)
    const image = assertScreenshot(await call(client, 'capture_screenshot', { project_path: project }), 'paused', CANVAS).image
    const inspected = await call(client, 'inspect_runtime', { project_path: project })
    assert.equal(inspected.isError, undefined, `inspect_runtime failed: ${JSON.stringify(inspected)}`)
    const snapshot = inspected.structuredContent.snapshot
    const samples = await inspector.evaluate(samplesInPage, { base64: image, points: await samplePoints(snapshot.view) })
    return { image, snapshot, samples, assets: { booted: start.structuredContent.assets, swapped: swapped.structuredContent.assets } }
  } finally {
    const stopped = await call(client, 'stop_project', { project_path: project })
    await restore()
    // A start that failed has no session to stop: its error above is the one to see.
    if (start.isError === undefined) {
      assert.equal(stopped.structuredContent.stopped, true)
      await assertUrlClosed(start.structuredContent.url)
    }
  }
}

/** validate_project on a plain third-person demo: zero errors, and one component-space-mismatch with a PlatformerMotor on the Player. */
async function assertValidates({ helpers, client, parent }) {
  const project = path.join(parent, 'waica-third-person-validation')
  const created = await helpers.call(client, 'create_project', { project_path: project, start: 'demo', archetype: 'third-person' })
  assert.equal(created.isError, undefined, `create_project failed: ${JSON.stringify(created)}`)
  const validated = await helpers.call(client, 'validate_project', { project_path: project })
  const { summary, findings } = validated.structuredContent
  assert.equal(summary.errors, 0, `validate_project must report no error; ${JSON.stringify(findings.filter((finding) => finding.severity === 'error'))}`)
  const restore = await rewriteScene(project, SCENE, (scene) => {
    const player = scene.entities.find((entity) => entity.name === 'Player')
    player.components = [...(player.components ?? []), { type: 'PlatformerMotor' }]
  })
  try {
    const mismatched = (await helpers.call(client, 'validate_project', { project_path: project })).structuredContent.findings
    const mismatches = mismatched.filter((finding) => finding.code === 'component-space-mismatch')
    assert.equal(mismatches.length, 1, `a PlatformerMotor in the 3D demo must be one component-space-mismatch; ${JSON.stringify(mismatches)}`)
    assert.match(mismatches[0].message, /PlatformerMotor/)
  } finally {
    await restore()
  }
  return summary
}

/** The glbs loaded: at boot all nine and Rapier, and after the scene swap nothing pending or failed. */
function assertGlbLoaded({ booted, swapped }) {
  assert.ok(booted && swapped, `start_project and the scene swap must carry assets; ${JSON.stringify({ booted, swapped })}`)
  assert.equal(booted.loaded, DEMO_ASSETS, `the demo must load its nine glbs and Rapier; ${JSON.stringify(booted)}`)
  assert.deepEqual(swapped, { pending: 0, loaded: DEMO_ASSETS, failed: 0 }, `the swap must leave every glb loaded; ${JSON.stringify({ booted, swapped })}`)
}

/** The snapshot of the demo: space, the orbit camera following the Player, a Model per level piece, the Sun and four torches. */
function assertSnapshot(snapshot, scene) {
  assert.equal(snapshot.scene, SCENE)
  assert.equal(snapshot.space, '3d')
  assert.deepEqual({ ...snapshot.view, position: undefined, target: undefined }, { kind: 'perspective', position: undefined, target: undefined, fov: 55, follow: 'Player', yaw: 0, pitch: 20, distance: 6, distanceActual: 6 })
  const models = snapshot.entities.filter((entity) => entity.components.some((component) => component.type === 'Model'))
  assert.equal(models.length, scene.entities.length - 1, 'every entity but the Sun draws a Model')
  assert.equal(snapshot.lighting.sun.length, 1)
  assert.equal(snapshot.lighting.pointLights.length, 4, 'the four wall torches light the courtyard')
  assert.deepEqual(snapshot.lighting.lights, [], 'a 3D scene has none of the 2D Lights')
}

/** Margins under what the leg measured on webgl2 (issue #181, Linux Chrome 150): the floor 92 over the sky, the pool's warmth 28 (0 with the torches off). */
const MIN_FLOOR_OVER_SKY = 40
const MIN_POOL_WARMTH = 15

/** The frame draws the courtyard: the clear color above the far wall, a lit floor, a warm pool under a torch. */
async function assertFrame({ inspector, image, samples }) {
  const range = await inspector.range(image)
  const spread = Math.max(...[0, 1, 2].map((channel) => range.max[channel] - range.min[channel]))
  assert.ok(spread >= 60, `the frame must show a scene, not one flat color; ${JSON.stringify(range)}`)
  assert.ok(maxChannelDifference(samples.sky, BACKGROUND) <= BACKGROUND_TOLERANCE, `above the far wall the frame must show the clear color; ${JSON.stringify(samples)}`)
  assert.ok(brightness(samples.floor) > brightness(samples.sky) + MIN_FLOOR_OVER_SKY, `the floor must be lit; ${JSON.stringify(samples)}`)
  const pool = warmth(samples.underTorch) - warmth(samples.farFromTorches)
  assert.ok(pool >= MIN_POOL_WARMTH, `the floor under a torch must be warmer than out of the torches' reach; ${JSON.stringify({ pool, samples })}`)
  return pool
}

const torchesOff = (scene) => {
  for (const entity of scene.entities.filter((candidate) => candidate.prefab === 'tiles/torch')) {
    entity.overrides = { ...entity.overrides, PointLight: { ...entity.overrides?.PointLight, intensity: 0 } }
  }
}

// CA-22/I-15 (#203): preserve the pre-shadows lighting/depth oracle in
// test variants only. The shipped scene and all gameplay still default On.
const shadowOff = (scene) => {
  scene.render = { ...scene.render, shadows: { ...scene.render?.shadows, quality: 'off' } }
}

/** Depth, not spawn order, decides what is in front: the red box hides what is behind it either way, pixel for pixel. */
async function assertDepthOrder(context) {
  const first = await capture(context, (scene) => {
    shadowOff(scene)
    scene.entities.unshift(BLOCKER)
  })
  const last = await capture(context, (scene) => {
    shadowOff(scene)
    scene.entities.push(BLOCKER)
  })
  await context.keep('shadow-off-blocker-first', first.image)
  await context.keep('shadow-off-blocker-last', last.image)
  const [r, g, b] = first.samples.blocker
  assert.ok(r > 120 && g < 60 && b < 60, `the near red box must be drawn in front; ${JSON.stringify(first.samples.blocker)}`)
  const compared = await context.inspector.compare(first.image, last.image)
  assert.equal(compared.differing, 0, `spawn order must not change the frame; ${JSON.stringify(compared)}`)
  return { differingPixels: compared.differing, blocker: first.samples.blocker }
}

/**
 * The pixel checks, where the frame reliably draws. On CI's Linux WebGPU
 * (issue #151) this frame is blank in some runs and drawn in others, so
 * there its range is only reported, like the editor-3d leg's pixels; the
 * snapshot, physics, camera, combat and respawn stay required on it.
 */
async function assertPixels(context, shipped) {
  if (expectsBlankLighting(context.renderBackend)) {
    const { min, max } = await context.inspector.range(shipped.image)
    return { reportedOnly: 'https://github.com/chichex/waica/issues/151', range: { min, max } }
  }
  const legacy = await capture(context, shadowOff)
  await context.keep('shadow-off-lit', legacy.image)
  const pool = await assertFrame({ inspector: context.inspector, image: legacy.image, samples: legacy.samples })
  const dark = await capture(context, (scene) => {
    shadowOff(scene)
    torchesOff(scene)
  })
  await context.keep('shadow-off-torches-off', dark.image)
  const darkPool = warmth(dark.samples.underTorch) - warmth(dark.samples.farFromTorches)
  assert.ok(darkPool < pool / 2, `without the torches' light the pool must fade; ${JSON.stringify({ pool, darkPool })}`)
  return { lightingOracle: 'explicit-shadows-off', samples: legacy.samples, pool, darkPool, depth: await assertDepthOrder(context) }
}

/** The whole third-person leg; `helpers` are runtime-e2e.mjs's own. */
export async function runThirdPersonLeg({ client, root, parent, chrome, viteBin, engineRoot, playwright, label, helpers, renderBackend }) {
  const validation = await assertValidates({ helpers, client, parent })
  const project = await helpers.makeDemoProject({ client, root, parent, viteBin, engineRoot, archetype: 'third-person', name: 'waica-third-person' })
  const scene = JSON.parse(await readFile(path.join(project, `src/scenes/${SCENE}.scene.json`), 'utf8'))
  const inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
  const keep = (name, image) => helpers.keepScreenshot(`${label}-third-person-${name}.png`, image)
  const context = { helpers, client, project, chrome, inspector, renderBackend, keep }
  try {
    const shipped = await capture(context, () => {})
    await keep('shipped', shipped.image)
    assertGlbLoaded(shipped.assets)
    assertSnapshot(shipped.snapshot, scene)
    const poseHashAt = { frame: FRAME, hash: poseHashOf(shipped.snapshot) }
    assert.match(poseHashAt.hash ?? '', /^[0-9a-f]{8}$/, `the snapshot at frame ${FRAME} must carry the Player's pose hash; ${JSON.stringify(poseHashAt)}`)
    const idleDuration = await clipDuration(path.join(project, 'src/art/knight.glb'), CLIPS.idle)
    const play = await exerciseSimulation(context, { gravity: scene.simulation.gravity, inspector, renderBackend, keep, idleDuration })
    const pixels = await assertPixels(context, shipped)
    const camera = await exerciseCameraCollision(context)
    const combat = await exerciseCombat(context)
    const respawn = await exerciseRespawn(context)
    return { thirdPerson: { validation, animation: { ...play.animation, poseHashAt }, play, pixels, camera, combat, respawn } }
  } finally {
    await inspector.close()
  }
}
