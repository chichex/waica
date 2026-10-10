// Issue #154 (CA-17, CA-18): the 3D smoke test, drawn through a real Render
// Backend. The e2e never runs examples/* (it generates Projects through
// create_project), so the example's scene and glb are copied into a generated
// demo Project, loaded by name over the running Game, stepped and screenshot.
// The snapshot, validate_project and the decoded pixels are asserted, and (issue
// #159, CA-23) so is the physics: the Crate falls and rests, the Player walks,
// jumps and lands, all through the Runtime Bridge on whichever Render Backend.
import assert from 'node:assert/strict'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brightness, expectsBlankLighting, maxChannelDifference, rewriteScene, samplesInPage } from './runtime-e2e-lighting.mjs'

const EXAMPLE = fileURLToPath(new URL('../examples/smoke-3d/', import.meta.url))
/** The copied scene's name in the generated Project (its file stem). */
const SCENE = 'smoke-3d'
/** The frame every variant is captured at, as the other screenshot legs do. */
const FRAME = 13
const CANVAS = { width: 640, height: 360 }
/** The Game's clear color (template main.ts): what shows above the ground's far edge. */
const BACKGROUND = [0x1a, 0x1a, 0x2e]
/** Per-channel tolerance for the clear color: the same pixel on both Render Backends. */
const BACKGROUND_TOLERANCE = 4

const warmth = (pixel) => pixel[0] - pixel[2]

/**
 * Where world points land in the 640x360 screenshot, through the engine's own
 * perspective camera and projection (the scene's camera block, 16:9).
 */
async function projector(scene) {
  const { THREE, placePerspectiveCamera, resolvePerspectiveCamera, worldToNormalized } = await import('../packages/engine/dist/index.js')
  const camera = new THREE.PerspectiveCamera()
  placePerspectiveCamera(camera, resolvePerspectiveCamera(scene.camera), CANVAS.width / CANVAS.height)
  return ([x, y, z]) => {
    const at = worldToNormalized(camera, { x, y, z })
    assert.ok(at, `the point ${x}, ${y}, ${z} must be in front of the camera`)
    return { x: Math.round(at.nx * CANVAS.width), y: Math.round(at.ny * CANVAS.height) }
  }
}

/** A point on a sphere of the scene, `radius` out from its centre along `direction`. */
function onSphere(centre, radius, direction) {
  const length = Math.hypot(...direction)
  return centre.map((component, axis) => component + (direction[axis] / length) * radius)
}

/**
 * The pixels the leg reads. The sphere (centre (0.5, 1, 1.5), diameter 2) gets
 * a point facing the Sun and one facing away from it, both visible from the
 * camera; the ground gets one under the Point Light and one at the same depth
 * far from it, on the far side of the Sun's flat light.
 */
async function samplePoints(scene) {
  const project = await projector(scene)
  const sphere = [0.5, 1, 1.5]
  return {
    sky: { x: CANVAS.width / 2, y: Math.round(CANVAS.height * 0.06) },
    sunSide: project(onSphere(sphere, 1, [0.6, 0.7, 0.4])),
    shadeSide: project(onSphere(sphere, 1, [-0.8, 0, 0.6])),
    underLamp: project([2.5, 0, 3.5]),
    farFromLamp: project([-7, 0, 3.5]),
    sphereCentre: project(sphere),
  }
}

/**
 * The physics of the running scene (issue #159 CA-23), driven through the
 * Runtime Bridge: the world is ready with the scene's gravity, the Crate falls
 * and rests on the Ground, holding right walks the Player, a jump lifts it and
 * it lands grounded. Tolerances, not exact values: the exact simulation is
 * pinned by the position hash of physics-determinism.test.ts, not by Chrome's
 * wasm.
 */
async function exercisePhysics({ helpers, client, project, gravity }) {
  const { call } = helpers
  const control = async (operation, extra = {}) => {
    const result = await call(client, 'control_runtime', { project_path: project, operation, ...extra })
    assert.equal(result.isError, undefined, `${operation} failed: ${JSON.stringify(result.structuredContent ?? result.content)}`)
  }
  const look = async (name) => {
    const inspected = await call(client, 'inspect_runtime', { project_path: project, entity_names: [name] })
    assert.equal(inspected.isError, undefined, `inspect_runtime(${name}) failed: ${JSON.stringify(inspected)}`)
    const { snapshot } = inspected.structuredContent
    const entity = snapshot.entities.find((candidate) => candidate.name === name)
    assert.ok(entity, `the snapshot must hold ${name}`)
    return { position: entity.transform.position, physics: snapshot.physics, body: snapshot.physics?.bodies.find((body) => body.entity === name) }
  }

  const falling = await look('Crate')
  assert.equal(falling.physics?.state, 'ready', `the physics world must be ready; ${JSON.stringify(falling.physics)}`)
  assert.deepEqual(falling.physics.gravity, gravity, 'the snapshot reports the scene gravity')
  await control('step', { frames: 120 })
  const crate = await look('Crate')
  assert.ok(Math.abs(crate.position.y - 0.5) <= 2e-2, `the Crate must rest on the Ground at y = 0.5; ${JSON.stringify(crate.position)}`)
  assert.equal(crate.body?.type, 'dynamic')

  const start = (await look('Player')).position
  await control('hold', { action: 'right' })
  await control('step', { frames: 30 })
  await control('release', { action: 'right' })
  const walked = (await look('Player')).position
  assert.ok(walked.x - start.x > 1.5, `holding right must walk the Player; ${JSON.stringify({ start, walked })}`)

  // Let it come to rest where the walk ended before it jumps.
  await control('step', { frames: 30 })
  const standing = (await look('Player')).position
  await control('press', { action: 'jump' })
  await control('step', { frames: 20 })
  const rising = (await look('Player')).position
  assert.ok(rising.y > standing.y + 0.5, `a jump must lift the Player above where it stood; ${JSON.stringify({ standing, rising })}`)
  await control('step', { frames: 90 })
  const landed = await look('Player')
  assert.equal(landed.body?.grounded, true, `the Player must land grounded; ${JSON.stringify(landed)}`)
  return { crateY: crate.position.y, walked: walked.x - start.x, jumpedTo: rising.y, landedY: landed.position.y }
}

/**
 * One paused Run Session: boot, swap to the 3D scene, step to FRAME, snapshot,
 * screenshot, and, with `physics` (the scene's gravity), the physics phase
 * after the screenshot (so the frame it took is the same in every variant);
 * then stop.
 */
async function capture({ helpers, client, project, chrome, physics = null }) {
  const { call, assertScreenshot, assertUrlClosed } = helpers
  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `start_project failed: ${JSON.stringify(start)}`)
  try {
    const swapped = await call(client, 'control_runtime', { project_path: project, operation: 'scene', scene: SCENE })
    assert.equal(swapped.isError, undefined, `scene:'${SCENE}' failed: ${JSON.stringify(swapped)}`)
    const stepped = await call(client, 'control_runtime', { project_path: project, operation: 'step', frames: FRAME })
    assert.equal(stepped.isError, undefined, `step in '${SCENE}' failed: ${JSON.stringify(stepped.structuredContent ?? stepped.content)}`)
    const shot = assertScreenshot(await call(client, 'capture_screenshot', { project_path: project }), 'paused', CANVAS)
    const inspected = await call(client, 'inspect_runtime', { project_path: project })
    assert.equal(inspected.isError, undefined, `inspect_runtime failed: ${JSON.stringify(inspected)}`)
    // After the screenshot, so the frame every variant is compared at stays frame 13.
    const simulated = physics ? await exercisePhysics({ helpers, client, project, gravity: physics.gravity }) : null
    return {
      image: shot.image,
      snapshot: inspected.structuredContent.snapshot,
      physics: simulated,
      // The swap answers once the incoming scene's art settled: the glb is in these numbers, not in start_project's.
      assets: { booted: start.structuredContent.assets, swapped: swapped.structuredContent.assets },
    }
  } finally {
    const stopped = await call(client, 'stop_project', { project_path: project })
    assert.equal(stopped.structuredContent.stopped, true)
    await assertUrlClosed(start.structuredContent.url)
  }
}

/** Copies the example's scene and glb into a generated Project. */
async function copyExample(project) {
  await mkdir(path.join(project, 'src/art'), { recursive: true })
  await copyFile(path.join(EXAMPLE, 'src/scenes/main.scene.json'), path.join(project, `src/scenes/${SCENE}.scene.json`))
  await copyFile(path.join(EXAMPLE, 'art/tree.glb'), path.join(project, 'src/art/tree.glb'))
}

/** The runnable Project: a demo wired to the checkout's packages, with the example copied in. */
async function makeRunnableProject({ helpers, client, root, parent, viteBin, engineRoot }) {
  const project = await helpers.makeDemoProject({ client, root, parent, viteBin, engineRoot, archetype: 'platformer', name: 'waica-smoke-3d' })
  await copyExample(project)
  return project
}

/**
 * validate_project on a plain create_project demo with the example copied in:
 * the runnable Project's node_modules hold TypeScript sources Node cannot load
 * (the server falls back to its own bundled packages for a Project without
 * any), so the check runs on its own Project. The 3D scene, its glb and the 2D
 * demo beside it: zero errors.
 */
async function assertValidates({ helpers, client, parent }) {
  const project = path.join(parent, 'waica-smoke-3d-validation')
  const created = await helpers.call(client, 'create_project', { project_path: project, start: 'demo', archetype: 'platformer' })
  assert.equal(created.isError, undefined, `create_project failed: ${JSON.stringify(created)}`)
  await copyExample(project)
  const validated = await helpers.call(client, 'validate_project', { project_path: project })
  assert.equal(validated.isError, undefined, `validate_project failed: ${JSON.stringify(validated)}`)
  const { summary, findings } = validated.structuredContent
  const errors = findings.filter((finding) => finding.severity === 'error')
  assert.equal(summary.errors, 0, `validate_project must report no error; ${JSON.stringify(errors)}`)
  await assertPlatformerMotorMismatch({ helpers, client, project })
  return summary
}

/**
 * A 2D behavior in the 3D scene is an error now (issue #159 CA-1 to CA-3):
 * the same scene with a PlatformerMotor added to the Player reports exactly
 * one component-space-mismatch.
 */
async function assertPlatformerMotorMismatch({ helpers, client, project }) {
  const restore = await rewriteScene(project, SCENE, (scene) => {
    scene.entities.find((entity) => entity.name === 'Player').components.push({ type: 'PlatformerMotor' })
  })
  try {
    const validated = await helpers.call(client, 'validate_project', { project_path: project })
    assert.equal(validated.isError, undefined, `validate_project failed: ${JSON.stringify(validated)}`)
    const mismatches = validated.structuredContent.findings.filter((finding) => finding.code === 'component-space-mismatch')
    assert.equal(mismatches.length, 1, `a PlatformerMotor in the 3D scene must be one component-space-mismatch; ${JSON.stringify(mismatches)}`)
    assert.match(mismatches[0].message, /PlatformerMotor/)
  } finally {
    await restore()
  }
}

/** The glb loaded: after the swap nothing is pending or failed, and one more asset loaded than at boot. */
function assertGlbLoaded({ booted, swapped }) {
  assert.ok(booted && swapped, `start_project and the scene swap must carry assets; ${JSON.stringify({ booted, swapped })}`)
  assert.equal(swapped.failed, 0, `the glb must load; ${JSON.stringify({ booted, swapped })}`)
  assert.equal(swapped.pending, 0, `the swap must wait for the glb; ${JSON.stringify({ booted, swapped })}`)
  assert.ok(swapped.loaded > booted.loaded, `the swap must have loaded the glb; ${JSON.stringify({ booted, swapped })}`)
}

/** The snapshot of the 3D scene: space, view, a model off the ground plane, the Sun and the Point Light. */
function assertSnapshot(snapshot) {
  assert.equal(snapshot.scene, SCENE)
  assert.equal(snapshot.space, '3d')
  assert.equal(snapshot.view.kind, 'perspective')
  assert.deepEqual(snapshot.view.position, [0, 5.5, 11])
  assert.deepEqual(snapshot.view.target, [0, 0.8, 0])
  const modelEntities = snapshot.entities.filter((entity) => entity.components.some((component) => component.type === 'Model'))
  assert.equal(modelEntities.length, 8, 'the ground, the box, the sphere, the glb, the player, the step, the wall and the crate are Models')
  assert.ok(modelEntities.some((entity) => entity.transform.position.z !== 0), 'a Model stands off the z = 0 plane')
  assert.equal(snapshot.lighting.sun.length, 1)
  assert.equal(snapshot.lighting.pointLights.length, 1)
  assert.deepEqual(snapshot.lighting.pointLights[0].position, [2.5, 1.2, 3.5])
  assert.deepEqual(snapshot.lighting.lights, [], 'a 3D scene has none of the 2D Lights')
}

/**
 * The frame draws a 3D scene: not blank, varied, the clear color above the
 * ground's far edge and a lit, greener-than-sky ground below it.
 */
async function assertFrame({ inspector, image, samples }) {
  const range = await inspector.range(image)
  const spread = Math.max(...[0, 1, 2].map((channel) => range.max[channel] - range.min[channel]))
  assert.ok(spread >= 60, `the frame must show a scene, not one flat color; ${JSON.stringify(range)}`)
  assert.ok(
    maxChannelDifference(samples.sky, BACKGROUND) <= BACKGROUND_TOLERANCE,
    `above the horizon the frame must show the clear color ${BACKGROUND}; ${JSON.stringify(samples)}`,
  )
  assert.ok(brightness(samples.farFromLamp) > brightness(samples.sky) + 40, `the ground must be lit; ${JSON.stringify(samples)}`)
  assert.ok(samples.farFromLamp[1] > samples.farFromLamp[0] + 10, `the ground is green; ${JSON.stringify(samples)}`)
}

/** The lights shape what is drawn: shading on the sphere, a warm pool under the lamp. */
function lightingMeasures(samples) {
  return {
    sphereShading: brightness(samples.sunSide) - brightness(samples.shadeSide),
    poolBrightness: brightness(samples.underLamp) - brightness(samples.farFromLamp),
    poolWarmth: warmth(samples.underLamp) - warmth(samples.farFromLamp),
  }
}

/** Margins under what the leg measured on both Render Backends (shading 269, pool 139 and 72). */
const MIN_SHADING = 100
const MIN_POOL_BRIGHTNESS = 50
const MIN_POOL_WARMTH = 25

function assertLit(lit, samples) {
  const detail = JSON.stringify({ lit, samples })
  assert.ok(lit.sphereShading >= MIN_SHADING, `the sphere must be brighter facing the Sun than away from it; ${detail}`)
  assert.ok(lit.poolBrightness >= MIN_POOL_BRIGHTNESS, `the ground under the Point Light must be brighter than far from it; ${detail}`)
  assert.ok(lit.poolWarmth >= MIN_POOL_WARMTH, `the Point Light's pool must be warm; ${detail}`)
}

/** Turns a light off in a copy of the scene, to see that the pixels follow it. */
function lightOff(entityName, type) {
  return (scene) => {
    const light = scene.entities.find((entity) => entity.name === entityName).components.find((component) => component.type === type)
    light.props.intensity = 0
  }
}

/** A red box between the camera and the sphere, spawned before or after it in the scene's entity list. */
const BLOCKER = {
  name: 'Blocker',
  position: [0.5, 1, 4],
  components: [{ type: 'Model', props: { shape: 'box', color: 0xff0000, size: 3 } }],
}

const blockerBefore = (scene) => {
  scene.entities.unshift(BLOCKER)
}
const blockerAfter = (scene) => {
  scene.entities.push(BLOCKER)
}

/** One variant of the copied scene: edit, capture, restore, sample. */
async function variant({ helpers, client, project, chrome, inspector, points, edit, physics }) {
  const restore = await rewriteScene(project, SCENE, edit)
  const frame = await capture({ helpers, client, project, chrome, physics }).finally(restore)
  return { ...frame, samples: await inspector.evaluate(samplesInPage, { base64: frame.image, points }) }
}

/**
 * Depth, not spawn order, decides what is in front (CA-4): a box nearer the
 * camera hides the sphere whether it is spawned before or after it, and the
 * two frames are pixel-identical.
 */
async function assertDepthOrder({ blockedFirst, blockedLast, inspector }) {
  const centre = blockedFirst.samples.sphereCentre
  assert.ok(centre[0] > 120 && centre[1] < 60 && centre[2] < 60, `the near red box must hide the sphere; ${JSON.stringify(centre)}`)
  const compared = await inspector.compare(blockedFirst.image, blockedLast.image)
  assert.equal(compared.differing, 0, `spawn order must not change the frame; ${JSON.stringify(compared)}`)
  return { differingPixels: compared.differing, sphereCentre: centre }
}

/**
 * Expected failure, narrowly (the same one as the lighting leg: PR #150,
 * https://github.com/chichex/waica/issues/151): on CI's headless Linux WebGPU
 * a frame with lights comes out blank — no failed step, no page error — while
 * the webgl2 leg and every local run draw it, and this scene's frame is lit.
 * Only there the leg asserts the one frame it captures is still opaque white
 * everywhere and fails the moment it renders, so the fix removes this
 * exception. The snapshot and validate_project stay required, and so does
 * every webgl2 assertion. This relaxes the #140 grill's decision 10 (a WebGPU
 * leg never skips) for this leg's pixel samples alone.
 */
async function assertExpectedBlank({ inspector, image }) {
  const { min, max } = await inspector.range(image)
  const blank = [...min, ...max].every((value) => value === 255)
  assert.ok(
    blank,
    `issue #151 is fixed for 3D frames: this one now renders on CI's Linux WebGPU, so remove the expectsBlankLighting exception from runtime-e2e-smoke-3d.mjs and let the pixel assertions run; ${JSON.stringify({ min, max })}`,
  )
  return { expectedBlank: 'https://github.com/chichex/waica/issues/151' }
}

/** The whole 3D smoke leg; `helpers` are runtime-e2e.mjs's own. */
export async function runSmoke3dLeg({ client, root, parent, chrome, viteBin, engineRoot, playwright, label, helpers, renderBackend }) {
  const validation = await assertValidates({ helpers, client, parent })
  const project = await makeRunnableProject({ helpers, client, root, parent, viteBin, engineRoot })
  const scene = JSON.parse(await readFile(path.join(project, `src/scenes/${SCENE}.scene.json`), 'utf8'))
  const points = await samplePoints(scene)
  const inspector = await helpers.openPngInspector(playwright, chrome.executablePath)
  const run = (name, edit, options = {}) => variant({ helpers, client, project, chrome, inspector, points, edit, ...options }).then(async (frame) => {
    await helpers.keepScreenshot(`${label}-smoke-3d-${name}.png`, frame.image)
    return frame
  })
  try {
    // The scene's own gravity, read from the file the project runs, not repeated here.
    const shipped = await run('shipped', () => {}, { physics: { gravity: scene.simulation.gravity } })
    assertGlbLoaded(shipped.assets)
    assertSnapshot(shipped.snapshot)
    if (expectsBlankLighting(renderBackend)) {
      return { smoke3d: { validation, physics: shipped.physics, ...(await assertExpectedBlank({ inspector, image: shipped.image })) } }
    }
    await assertFrame({ inspector, image: shipped.image, samples: shipped.samples })
    const lit = lightingMeasures(shipped.samples)
    assertLit(lit, shipped.samples)
    const sunOff = lightingMeasures((await run('no-sun', lightOff('Daylight', 'Sun'))).samples)
    assert.ok(sunOff.sphereShading < lit.sphereShading / 2, `without the Sun the sphere's shading must fall; ${JSON.stringify({ lit, sunOff })}`)
    const lampOff = lightingMeasures((await run('no-lamp', lightOff('Lamp', 'PointLight'))).samples)
    assert.ok(lampOff.poolBrightness < lit.poolBrightness / 2, `without the Point Light the pool must fade; ${JSON.stringify({ lit, lampOff })}`)
    const depth = await assertDepthOrder({
      blockedFirst: await run('blocker-first', blockerBefore),
      blockedLast: await run('blocker-last', blockerAfter),
      inspector,
    })
    return { smoke3d: { validation, physics: shipped.physics, samples: shipped.samples, lit, sunOff, lampOff, depth } }
  } finally {
    await inspector.close()
  }
}
