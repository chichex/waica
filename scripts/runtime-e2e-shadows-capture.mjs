import assert from 'node:assert/strict'
import { CANVAS, FRAME, writeShadowFixture } from './runtime-e2e-shadows-fixtures.mjs'
import { projectPoints, receiverSamples } from './runtime-e2e-shadows-pixels.mjs'

function assertNoBrowserErrors(snapshot) {
  // A project-owned observation component reports console/page errors via inspect_runtime.
  const diagnostics = snapshot.entities.find((entity) => entity.name === 'Diagnostics')
  const errors = diagnostics?.components.find((component) => component.type === 'ShadowDiagnostics')?.state?.browserErrors
  assert.ok(Array.isArray(errors), `browser diagnostics must be observable: ${JSON.stringify(diagnostics)}`)
  assert.deepEqual(errors, [], `shadow rendering must emit no console/page errors: ${JSON.stringify(errors)}`)
}

async function captureFrame(context, options) {
  const { helpers, client, project, inspector, label, renderBackend } = context
  const { variant, frame, points } = options
  const shot = helpers.assertScreenshot(await helpers.call(client, 'capture_screenshot', { project_path: project }), 'paused', CANVAS)
  assert.equal(shot.metadata.frame, frame, 'a capture must not advance the fixed frame')
  const filename = `${label}-${renderBackend}-shadows-${variant}-f${frame}.png`
  await helpers.keepScreenshot(filename, shot.image)
  const inspected = await helpers.call(client, 'inspect_runtime', { project_path: project })
  assert.equal(inspected.isError, undefined, `shadow inspect failed: ${JSON.stringify(inspected)}`)
  assert.equal(inspected.structuredContent.frame, frame)
  const snapshot = inspected.structuredContent.snapshot
  assert.equal(snapshot.backend, renderBackend, 'shadow evidence must report the requested backend, never fallback')
  assert.equal(snapshot.space, '3d')
  const range = await inspector.range(shot.image)
  const spread = Math.max(...[0, 1, 2].map((channel) => range.max[channel] - range.min[channel]))
  assert.ok(spread >= 60, `${variant}: blank/flat frames fail on every backend: ${JSON.stringify(range)}`)
  const pixels = await projectPoints(snapshot.view, points)
  const samples = await inspector.evaluate(receiverSamples, { image: shot.image, points: pixels })
  assertNoBrowserErrors(snapshot)
  return { variant, frame, filename, image: shot.image, snapshot, samples }
}

/** Every variant gets its own real Run Session, including each On/Off control. */
export async function captureShadow(context, { scene, points, variant, frames = [FRAME] }) {
  const { helpers, client, project, chrome } = context
  await writeShadowFixture(project, scene)
  const start = await helpers.call(client, 'start_project', { project_path: project, browser_executable_path: chrome.executablePath, timeout_ms: 30_000 })
  try {
    assert.equal(start.isError, undefined, `shadow start failed: ${JSON.stringify(start)}`)
    const backend = start.structuredContent.initialSnapshot.backend
    assert.ok(['webgl2', 'webgpu'].includes(backend), 'shadow evidence needs a real Render Backend')
    context.renderBackend ??= backend
    assert.equal(backend, context.renderBackend, 'the shadow leg must never fall back from its requested backend')
    assert.equal(start.structuredContent.mode, 'paused')
    assert.deepEqual({ pending: start.structuredContent.assets.pending, failed: start.structuredContent.assets.failed }, { pending: 0, failed: 0 })
    const captures = []
    let previous = 0
    for (const frame of frames) {
      const stepped = await helpers.call(client, 'control_runtime', { project_path: project, operation: 'step', frames: frame - previous })
      assert.equal(stepped.isError, undefined, `shadow step failed: ${JSON.stringify(stepped)}`)
      assert.equal(stepped.structuredContent.frame, frame)
      captures.push({ ...await captureFrame(context, { variant, frame, points }), initialView: start.structuredContent.initialSnapshot.view })
      previous = frame
    }
    return captures
  } finally {
    const stopped = await helpers.call(client, 'stop_project', { project_path: project })
    if (start.isError === undefined) {
      assert.equal(stopped.structuredContent.stopped, true)
      await helpers.assertUrlClosed(start.structuredContent.url)
    }
  }
}

export async function capturePair(context, options) {
  const on = await captureShadow(context, { ...options, variant: `${options.variant}-on` })
  const offScene = structuredClone(options.scene)
  offScene.render.shadows.quality = 'off'
  const off = await captureShadow(context, { ...options, scene: offScene, variant: `${options.variant}-off` })
  for (const [index, frame] of on.entries()) {
    assert.deepEqual(frame.snapshot.view, off[index].snapshot.view, 'On/Off must preserve the camera')
    assert.deepEqual(frame.snapshot.time, off[index].snapshot.time, 'On/Off must preserve Game Time')
    assert.deepEqual(frame.snapshot.entities.map((entity) => entity.transform), off[index].snapshot.entities.map((entity) => entity.transform), 'On/Off must preserve entity poses')
  }
  return { on, off }
}
