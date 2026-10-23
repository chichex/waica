// Issue #166 CA-18 (moved to the third-person demo by issue #181 CA-35): what
// the third-person leg (runtime-e2e-third-person.mjs) asks of
// the demo Player's animation through the Runtime Bridge: the Run Session
// operations and snapshot reads it needs, the Player's animation as the
// snapshot reports it, the idle phase (clip time, pose hash, moving pixels),
// and the pose hash both Render Backend legs must agree on.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { expectsBlankLighting } from './runtime-e2e-lighting.mjs'

/**
 * The demo Knight's clips (the archetype's KNIGHT_CLIPS): idle, walk and run
 * play `locomotion`, the blend of Idle, Walking_A and Running_A by speed
 * (issue #205); jump and attack play their own.
 */
export const CLIPS = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', jump: 'Jump_Start', attack: '1H_Melee_Attack_Chop', locomotion: 'Locomotion' }
/** How many decoded pixels two idle frames 20 frames apart must differ in, where the frame draws. */
const MIN_IDLE_DIFFERING_PIXELS = 50

/** The duration of the named clip of a glb, from its JSON chunk: the latest keyframe time of its samplers. */
export async function clipDuration(file, name) {
  const bytes = await readFile(file)
  const jsonLength = bytes.readUInt32LE(12)
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const animation = document.animations.find((candidate) => candidate.name === name)
  assert.ok(animation, `the glb must hold the clip "${name}"`)
  return Math.max(...animation.samplers.map((sampler) => document.accessors[sampler.input].max[0]))
}

/** The seconds from clip time `from` to clip time `to` on a looping clip of `duration`. */
const forwardDelta = (from, to, duration) => (((to - from) % duration) + duration) % duration

/** The Runtime Bridge operations and snapshot reads one Run Session needs, each asserting it succeeded; `canvas` is the size every screenshot must have. */
export function session({ helpers, client, project, canvas }) {
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
    const stateOf = (type) => entity.components.find((component) => component.type === type)?.state
    return {
      position: entity.transform.position,
      rotation: entity.transform.rotation,
      physics: snapshot.physics,
      body: snapshot.physics?.bodies.find((body) => body.entity === name),
      machine: stateOf('StateMachine'),
      animator: stateOf('Animator'),
    }
  }
  const screenshot = async () => helpers.assertScreenshot(await call(client, 'capture_screenshot', { project_path: project }), 'paused', canvas).image
  return { control, look, screenshot }
}

/** The Player's animation as the snapshot reports it: the machine's state, the Animator's clip, time, pose and clip weights, the yaw. */
export function animationOf(player) {
  assert.ok(player.machine && player.animator, `the Player must carry a StateMachine and an Animator; ${JSON.stringify(player)}`)
  const { current, time, poseHash, loaded, weights } = player.animator
  return { state: player.machine.current, clip: current, time, poseHash, loaded, weights, yaw: player.rotation.y }
}

/** The clip with the largest weight in an Animator's `weights`, and that weight. */
export function heaviestClip(weights) {
  const [clip, weight] = Object.entries(weights ?? {}).reduce((best, entry) => (entry[1] > best[1] ? entry : best), ['', 0])
  return { clip, weight }
}

/**
 * The Player idling (issue #166 CA-18): the machine in idle and the Animator
 * loaded on the Locomotion blend with Idle alone (issue #205 CA-16); two
 * snapshots 10 frames apart 10/60 s apart in clip time (on the looping clip,
 * so modulo its duration) and with different pose hashes; and, where the
 * frame draws, two screenshots 20 frames apart that differ in pixels (the
 * demo plays it with no skeleton around).
 */
export async function exerciseIdle({ control, look, screenshot }, { inspector, renderBackend, keep, idleDuration }) {
  const first = animationOf(await look('Player'))
  assert.equal(first.state, 'idle', `the Player must idle at rest; ${JSON.stringify(first)}`)
  assert.equal(first.loaded, true, `the Animator must have loaded the knight; ${JSON.stringify(first)}`)
  assert.equal(first.clip, CLIPS.locomotion, `the Animator must play the Locomotion blend; ${JSON.stringify(first)}`)
  assert.deepEqual(first.weights, { [CLIPS.idle]: 1 }, `standing still, Locomotion must sound Idle alone; ${JSON.stringify(first)}`)
  await control('step', { frames: 10 })
  const later = animationOf(await look('Player'))
  const delta = forwardDelta(first.time, later.time, idleDuration)
  assert.ok(Math.abs(delta - 10 / 60) <= 1e-3, `ten frames must advance the clip 10/60 s; ${JSON.stringify({ first, later, delta, idleDuration })}`)
  assert.notEqual(later.poseHash, first.poseHash, `ten frames must change the pose; ${JSON.stringify({ first, later })}`)
  if (expectsBlankLighting(renderBackend)) return { delta, differingIdlePixels: null }
  const before = await screenshot()
  await control('step', { frames: 20 })
  const after = await screenshot()
  await keep('idle-before', before)
  await keep('idle-after', after)
  const compared = await inspector.compare(before, after)
  assert.ok(compared.differing >= MIN_IDLE_DIFFERING_PIXELS, `the idle clip must move pixels; ${JSON.stringify(compared)}`)
  return { delta, differingIdlePixels: compared.differing }
}

/** The Player's Animator pose hash in a snapshot, or null when the Player carries none. */
export function poseHashOf(snapshot) {
  const player = snapshot.entities.find((entity) => entity.name === 'Player')
  return player?.components.find((component) => component.type === 'Animator')?.state?.poseHash ?? null
}

