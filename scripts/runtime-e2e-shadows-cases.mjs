import assert from 'node:assert/strict'
import { capturePair } from './runtime-e2e-shadows-capture.mjs'
import { FRAME, model, POINT_POINTS, propsOf, shadowScene, SUN_POINTS } from './runtime-e2e-shadows-fixtures.mjs'
import { assertReceiverPair, assertUnshadowed } from './runtime-e2e-shadows-pixels.mjs'

function lightOf(capture, kind) {
  const { lighting } = capture.snapshot
  assert.equal(lighting.lights.length, 0, 'the fixture has no 2D lighting')
  assert.equal(lighting.sun.length, kind === 'sun' ? 1 : 0, 'Sun must be isolated')
  assert.equal(lighting.pointLights.length, kind === 'point' ? 1 : 0, 'PointLight must be isolated')
  return kind === 'sun' ? lighting.sun[0] : lighting.pointLights[0]
}

export async function isolatedLight(context, kind) {
  const points = kind === 'sun' ? SUN_POINTS : POINT_POINTS
  const { on: [on], off: [off] } = await capturePair(context, { scene: shadowScene(kind), points, variant: kind })
  const enabled = lightOf(on, kind)
  const disabled = lightOf(off, kind)
  assert.equal(enabled.shadows.enabled, true)
  assert.equal(disabled.shadows.enabled, false, 'global Off must dominate explicit per-light true')
  assert.equal(disabled.shadows.requested.castShadows, true, 'Off must retain the per-light request')
  assert.equal(enabled.intensity, disabled.intensity, 'Off must preserve direct illumination')
  const result = assertReceiverPair(on, off)
  if (kind === 'point') {
    const controlDistance = Math.hypot(1.5, 1, 1.5)
    assert.equal(enabled.distance, 9, 'the shadow range must not shorten physical light attenuation')
    assert.equal(enabled.shadows.maxDistance, 2)
    assert.ok(controlDistance > 2 && controlDistance < 9, 'the diagonal control must be outside the Euclidean shadow radius but still lit')
    result.radialRange = { physicalDistance: enabled.distance, shadowDistance: enabled.shadows.maxDistance, controlDistance }
  }
  return result
}

export async function disabledFlags(context, kind) {
  const points = kind === 'sun' ? SUN_POINTS : POINT_POINTS
  const results = {}
  for (const [name, entity, type, flag] of [
    ['caster-disabled', 'Caster', 'Model', 'castShadows'],
    ['light-disabled', 'Light', kind === 'sun' ? 'Sun' : 'PointLight', 'castShadows'],
  ]) {
    const scene = shadowScene(kind)
    propsOf(scene, entity, type)[flag] = false
    const { on: [on], off: [off] } = await capturePair(context, { scene, points, variant: `${kind}-${name}` })
    const delta = assertUnshadowed(on, off)
    assertUnshadowed(on, off, 'control')
    assert.equal(lightOf(on, kind).shadows.enabled, name !== 'light-disabled')
    assert.equal(lightOf(on, kind).intensity, lightOf(off, kind).intensity)
    results[name] = { delta, on: on.samples, off: off.samples, screenshots: [on.filename, off.filename] }
  }
  return results
}

export async function independentReceivers(context) {
  const scene = shadowScene()
  propsOf(scene, 'Ground').receiveShadows = false
  // A separate, slightly raised receiver retains its own shadow participation.
  scene.entities.push(model('OtherGround', [4, 0.01, 0], { shape: 'plane', size: 4, castShadows: false }))
  scene.entities.push(model('OtherCaster', [4, 1, 0], { shape: 'box', size: 2 }))
  const points = { ...SUN_POINTS, other: [5.5, 0.01, 1.5] }
  const { on: [on], off: [off] } = await capturePair(context, { scene, points, variant: 'receive-disabled' })
  const disabledDelta = assertUnshadowed(on, off)
  const other = assertReceiverPair(on, off, 'other')
  return { disabledDelta, other }
}

export async function movingCaster(context) {
  const scene = shadowScene()
  const caster = scene.entities.find((entity) => entity.name === 'Caster')
  caster.position[0] = -FRAME * 4 / 60
  caster.components.push({ type: 'ShadowMover' })
  const points = { ...SUN_POINTS, moved: [5.5, 0, 1.5] }
  const { on, off } = await capturePair(context, { scene, points, variant: 'moving-caster', frames: [FRAME, FRAME + 60] })
  const position = (capture) => capture.snapshot.entities.find((entity) => entity.name === 'Caster').transform.position.x
  assert.ok(Math.abs(position(on[0])) < 1e-6, 'frame 13 pins the caster at x=0')
  assert.ok(Math.abs(position(on[1]) - 4) < 1e-6, '60 Simulation Steps move the caster to x=4')
  const before = assertReceiverPair(on[0], off[0])
  const after = assertReceiverPair(on[1], off[1], 'moved')
  assertUnshadowed(on[0], off[0], 'moved')
  assertUnshadowed(on[1], off[1])
  return { before, after, positions: [position(on[0]), position(on[1])] }
}

export async function farCamera(context) {
  const scene = shadowScene()
  for (const name of ['Ground', 'Caster']) {
    const entity = scene.entities.find((candidate) => candidate.name === name)
    entity.position[0] += 500
    entity.position[2] += 500
  }
  // Authored position/target and the Sun remain at the origin. The active
  // orbit camera follows its target through a 500-unit teleport before capture.
  scene.camera = { kind: 'perspective', follow: 'Anchor', pitch: 30, distance: 12, lookHeight: 0, fov: 50 }
  scene.entities.push({ name: 'Anchor', position: [0, 0, 0], components: [{ type: 'ShadowTeleport' }] })
  const points = Object.fromEntries(Object.entries(SUN_POINTS).map(([name, [x, y, z]]) => [name, [x + 500, y, z + 500]]))
  const { on: [on], off: [off] } = await capturePair(context, { scene, points, variant: 'sun-follow-far-camera' })
  assert.ok(Math.abs(on.initialView.position[0]) < 20, 'the camera must start near the origin')
  assert.ok(on.snapshot.view.position[0] >= 500 && on.snapshot.view.position[2] >= 500, 'the active camera must follow the teleported target far from origin')
  assert.deepEqual(on.snapshot.entities.find((entity) => entity.name === 'Light').transform.position, { x: 0, y: 0, z: 0 }, 'Sun entity position must not anchor its coverage')
  return { ...assertReceiverPair(on, off), view: on.snapshot.view, initialView: on.initialView }
}

export async function staticGltf(context) {
  const scene = shadowScene()
  const caster = scene.entities.find((entity) => entity.name === 'Caster')
  caster.position = [0, 0, 0]
  caster.components = [{ type: 'Model', props: { src: 'src/art/dungeon-pillar.glb' } }]
  const { on: [on], off: [off] } = await capturePair(context, { scene, points: SUN_POINTS, variant: 'static-gltf' })
  const state = on.snapshot.entities.find((entity) => entity.name === 'Caster').components.find((component) => component.type === 'Model').state
  assert.match(state.src, /dungeon-pillar\.glb$/)
  return assertReceiverPair(on, off)
}
