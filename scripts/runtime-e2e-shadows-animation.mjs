import assert from 'node:assert/strict'
import path from 'node:path'
import { clipDuration } from './runtime-e2e-animation.mjs'
import { capturePair } from './runtime-e2e-shadows-capture.mjs'
import { FRAME, propsOf, shadowScene } from './runtime-e2e-shadows-fixtures.mjs'
import { assertUnshadowed, projectPoints } from './runtime-e2e-shadows-pixels.mjs'

// All four corners describe one fixed GROUND-ONLY world region. The live
// skinned bounds are projected separately and must not intersect this region.
const GROUND = { a: [1.9, 0, -1], b: [5, 0, -1], c: [5, 0, 2.5], d: [1.9, 0, 2.5] }
const CLIP = 'Walking_A'

function installGroundOracle() {
  globalThis.shadowInside = (point, polygon) => {
    const sides = polygon.map((a, index) => {
      const b = polygon[(index + 1) % polygon.length]
      return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    })
    return sides.every((side) => side >= 0) || sides.every((side) => side <= 0)
  }
  globalThis.shadowPatch = ({ deltas, width, centre, polygon }) => {
    const corners = [-2, 2].flatMap((dx) => [-2, 2].map((dy) => ({ x: centre.x + dx, y: centre.y + dy })))
    if (!corners.every((corner) => globalThis.shadowInside(corner, polygon))) return -Infinity
    let total = 0
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) total += deltas[(centre.y + dy) * width + centre.x + dx]
    }
    return total / 25
  }
}

// Serialized into the shared decoding page. No character-pixel differences
// can count: this polygon must be clear of the projected skinned bounds.
async function groundMaskInPage({ on, off, polygon, excluded, expectedGround }) {
  const a = await globalThis.decodePng(on)
  const b = await globalThis.decodePng(off)
  const deltas = new Float32Array(a.width * a.height)
  for (let index = 0; index < deltas.length; index += 1) {
    deltas[index] = [0, 1, 2].reduce((sum, channel) => sum + b.data[index * 4 + channel] - a.data[index * 4 + channel], 0) / 3
  }
  const result = { pixels: [], groundPixels: 0, overlap: 0, nonGround: 0, peak: { darkening: -Infinity, x: 0, y: 0 } }
  for (let y = 2; y < a.height - 2; y += 1) {
    for (let x = 2; x < a.width - 2; x += 1) {
      if (!globalThis.shadowInside({ x, y }, polygon)) continue
      result.groundPixels += 1
      if (excluded.some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) result.overlap += 1
      const index = y * a.width + x
      if ([0, 1, 2].some((channel) => Math.abs(b.data[index * 4 + channel] - expectedGround[channel]) > 2)) result.nonGround += 1
      if (deltas[index] >= 20) result.pixels.push(index)
      const darkening = globalThis.shadowPatch({ deltas, width: a.width, centre: { x, y }, polygon })
      if (darkening > result.peak.darkening) result.peak = { darkening, x, y }
    }
  }
  return result
}

async function projectedCaster(capture) {
  const diagnostics = capture.snapshot.entities.find((entity) => entity.name === 'Diagnostics')
  const bounds = diagnostics.components.find((component) => component.type === 'ShadowDiagnostics').state.casterBounds
  assert.ok(bounds, 'the glTF must expose loaded, live skinned world bounds')
  const points = {}
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) points[`${x}/${y}/${z}`] = [x, y, z]
    }
  }
  const pixels = Object.values(await projectPoints(capture.snapshot.view, points))
  return { left: Math.min(...pixels.map((point) => point.x)) - 2, right: Math.max(...pixels.map((point) => point.x)) + 2,
    top: Math.min(...pixels.map((point) => point.y)) - 2, bottom: Math.max(...pixels.map((point) => point.y)) + 2 }
}

function animatorOf(capture) {
  const caster = capture.snapshot.entities.find((entity) => entity.name === 'Caster')
  const animator = caster.components.find((component) => component.type === 'Animator')?.state
  assert.ok(animator?.loaded && animator.playing, `the glTF must animate: ${JSON.stringify(animator)}`)
  assert.equal(animator.current, CLIP)
  assert.match(animator.poseHash, /^[0-9a-f]{8}$/)
  return animator
}

async function assertGroundMasks(context, pair) {
  await context.inspector.evaluate(installGroundOracle)
  const polygon = Object.values(await projectPoints(pair.on[0].snapshot.view, GROUND))
  const excluded = await Promise.all([...pair.on, ...pair.off].map(projectedCaster))
  const masks = []
  for (const [index, on] of pair.on.entries()) {
    const off = pair.off[index]
    assertUnshadowed(on, off, 'control')
    const mask = await context.inspector.evaluate(groundMaskInPage, { on: on.image, off: off.image, polygon, excluded, expectedGround: off.samples.control.rgb })
    assert.ok(mask.groundPixels >= 300, 'the fixed receiver region must be nondegenerate')
    assert.equal(mask.overlap, 0, 'the ground-only ROI must exclude the character projection at BOTH poses')
    assert.equal(mask.nonGround, 0, 'every Off pixel in the ROI must match the illuminated ground control')
    assert.ok(mask.pixels.length >= 25, `frame ${on.frame}: a nondegenerate shadow must reach ground-only pixels: ${JSON.stringify(mask)}`)
    assert.ok(mask.peak.darkening >= 20, `frame ${on.frame}: a 5x5 ground ROI must darken >=20: ${JSON.stringify(mask.peak)}`)
    masks.push(mask)
  }
  const [first, later] = masks.map((mask) => new Set(mask.pixels))
  const changed = [...first].filter((pixel) => !later.has(pixel)).length + [...later].filter((pixel) => !first.has(pixel)).length
  assert.ok(changed >= 20, `the ANIMATED GROUND shadow mask must move with the pose, not just character pixels: changed=${changed}`)
  return { polygon, excluded, changed, poses: masks.map(({ pixels, ...metrics }) => ({ ...metrics, shadowPixels: pixels.length })) }
}

export async function animatedGltf(context) {
  const scene = shadowScene()
  scene.camera = { kind: 'perspective', position: [0, 12, 2], target: [0, 0, 0], fov: 50 }
  propsOf(scene, 'Light', 'Sun').direction = [3, -2, 1]
  const caster = scene.entities.find((entity) => entity.name === 'Caster')
  caster.position = [0, 0, 0]
  caster.components = [{ type: 'Model', props: { src: 'src/art/knight.glb' } }, { type: 'Animator', props: { initialClip: CLIP, fade: 0 } }]
  const pair = await capturePair(context, { scene, points: { control: [-4, 0, 2] }, variant: 'animated-gltf', frames: [FRAME, FRAME + 30] })
  const poses = pair.on.map(animatorOf)
  assert.deepEqual(poses, pair.off.map(animatorOf), 'each On/Off pair must have identical clip, time and poseHash')
  assert.notEqual(poses[0].poseHash, poses[1].poseHash, 'the two fixed frames must have different bone poses')
  assert.deepEqual(pair.on[0].snapshot.view, pair.on[1].snapshot.view, 'animation must not move the camera')
  const transform = (capture) => capture.snapshot.entities.find((entity) => entity.name === 'Caster').transform
  assert.deepEqual(transform(pair.on[0]), transform(pair.on[1]), 'only the skeleton pose, not the caster transform, may move')
  const duration = await clipDuration(path.join(context.project, 'src/art/knight.glb'), CLIP)
  const delta = ((poses[1].time - poses[0].time) % duration + duration) % duration
  assert.ok(Math.abs(delta - 30 / 60 % duration) <= 1e-6, '30 Simulation Steps must advance the clip by 0.5 seconds modulo its duration')
  const ground = await assertGroundMasks(context, pair)
  return { frames: pair.on.map((capture) => capture.frame), poses, duration, ground, screenshots: [...pair.on, ...pair.off].map((capture) => capture.filename) }
}
