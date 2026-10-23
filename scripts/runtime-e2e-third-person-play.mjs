// Issue #181 CA-35, CA-36: the third-person demo played through the Runtime
// Bridge, each check in its own Run Session over a copy of the demo scene
// that keeps only what the check needs (rewriteScene restores the file):
// walking, jumping and the Animator with no skeleton around; the orbit
// camera turned by `look` and pulled in front of a wall; a melee fight with
// one skeleton, a roll through its strike; a checkpoint and a respawn.
// Tolerances, not exact values: the exact simulation is pinned by the unit
// tests (behaviors, engine), not by Chrome.
import assert from 'node:assert/strict'
import { CLIPS, animationOf, exerciseIdle, heaviestClip, session } from './runtime-e2e-animation.mjs'
import { rewriteScene } from './runtime-e2e-lighting.mjs'

const CANVAS = { width: 640, height: 360 }
/** The demo's main scene, which the generated Project boots on. */
export const SCENE = 'main'
/** Pixels of locked mouse movement that turn the orbit 90° at the demo's sensitivity of 0.2 °/px. */
const QUARTER_TURN_DX = 450

export const withoutSkeletons = (scene) => {
  scene.entities = scene.entities.filter((entity) => entity.prefab !== 'characters/skeleton')
}

/** Starts a Run Session on the scene as `edit` leaves it, runs `body` with its operations, and always stops it. */
export async function withSession({ helpers, client, project, chrome }, edit, body) {
  const restore = await rewriteScene(project, SCENE, edit)
  const start = await helpers.call(client, 'start_project', { project_path: project, browser_executable_path: chrome.executablePath, timeout_ms: 30_000 })
  try {
    assert.equal(start.isError, undefined, `start_project failed: ${JSON.stringify(start)}`)
    return await body({ ...session({ helpers, client, project, canvas: CANVAS }), start })
  } finally {
    const stopped = await helpers.call(client, 'stop_project', { project_path: project })
    await restore()
    // A start that failed has no session to stop: its error above is the one to see.
    if (start.isError === undefined) {
      assert.equal(stopped.structuredContent.stopped, true)
      await helpers.assertUrlClosed(start.structuredContent.url)
    }
  }
}

/** Holding right for 30 frames: the Player walks in the walk state, Locomotion weighing Walking_A most (issue #205 CA-16), facing +x (the camera looks toward -z). */
async function exerciseWalk({ control, look }) {
  const start = (await look('Player')).position
  await control('hold', { action: 'right' })
  await control('step', { frames: 30 })
  const walking = await look('Player')
  await control('release', { action: 'right' })
  const walked = walking.position
  assert.ok(walked.x - start.x > 1.5, `holding right must walk the Player; ${JSON.stringify({ start, walked })}`)
  const animation = animationOf(walking)
  assert.equal(animation.state, 'walk', `holding right must put the Player in walk; ${JSON.stringify(animation)}`)
  assert.equal(animation.clip, CLIPS.locomotion, `walking must play the Locomotion blend; ${JSON.stringify(animation)}`)
  const heaviest = heaviestClip(animation.weights)
  assert.ok(heaviest.clip === CLIPS.walk && heaviest.weight >= 0.9, `30 frames of walking must weigh Walking_A at 0.9 or more; ${JSON.stringify(animation)}`)
  assert.ok(Math.abs(animation.yaw - Math.PI / 2) <= 0.05, `walking toward +x must turn the Player to yaw π/2; ${JSON.stringify(animation)}`)
  return { walked: walked.x - start.x, walkYaw: animation.yaw, walkState: animation.state }
}

/**
 * Issue #205 CA-16: holding left and run, one frame at a time, Locomotion
 * passes through a frame where Walking_A and Running_A both weigh over 0.1,
 * and Running_A then reaches 0.9 with the Player in run.
 */
async function exerciseRun({ control, look }) {
  await control('hold', { action: 'left' })
  await control('hold', { action: 'run' })
  const frames = []
  for (let frame = 0; frame < 40; frame += 1) {
    await control('step', { frames: 1 })
    frames.push(animationOf(await look('Player')))
  }
  await control('release', { action: 'run' })
  await control('release', { action: 'left' })
  const mixed = frames.findIndex(({ weights }) => (weights?.[CLIPS.walk] ?? 0) > 0.1 && (weights?.[CLIPS.run] ?? 0) > 0.1)
  assert.ok(mixed >= 0, `running must pass through a frame mixing Walking_A and Running_A; ${JSON.stringify(frames.map(({ weights }) => weights))}`)
  const ran = frames.findIndex((animation, index) => index > mixed && (animation.weights?.[CLIPS.run] ?? 0) >= 0.9)
  assert.ok(ran > mixed, `running on must weigh Running_A at 0.9 or more; ${JSON.stringify(frames.map(({ weights }) => weights))}`)
  // walk and run play the same Locomotion and the blend follows the body, so only the state shows the run signal arrived.
  assert.equal(frames[ran].state, 'run', `running on must put the Player in run; ${JSON.stringify(frames.map(({ state }) => state))}`)
  assert.ok(frames.every(({ clip }) => clip === CLIPS.locomotion), `running must keep playing Locomotion; ${JSON.stringify(frames.map(({ clip }) => clip))}`)
  return { mixedAt: mixed + 1, ranAt: ran + 1, runState: frames[ran].state }
}

/** Issue #205 CA-16: an attack press, one frame at a time: from its first frame in attack, the attack clip reaches full weight within 3 frames (its fade is 0.05 s). */
async function exerciseAttack({ control, look }) {
  await control('step', { frames: 30 })
  await control('press', { action: 'attack' })
  const frames = []
  for (let frame = 0; frame < 8 && frames.length < 3; frame += 1) {
    await control('step', { frames: 1 })
    const animation = animationOf(await look('Player'))
    if (animation.state === 'attack' || frames.length > 0) frames.push(animation)
  }
  assert.equal(frames[0]?.state, 'attack', `an attack press must put the Player in attack; ${JSON.stringify(frames)}`)
  assert.equal(frames[0].clip, CLIPS.attack, `attacking must play the attack clip; ${JSON.stringify(frames)}`)
  const full = frames.findIndex(({ weights }) => weights?.[CLIPS.attack] === 1)
  assert.ok(full >= 0 && full < 3, `the attack clip must reach weight 1 within 3 frames of entering attack; ${JSON.stringify(frames.map(({ weights }) => weights))}`)
  await control('step', { frames: 90 })
  return { fullWeightAt: full + 1 }
}

/** A jump press: the Player rises on the jump clip in the jump state, then lands grounded and idle on the Locomotion blend. */
async function exerciseJump({ control, look }) {
  await control('step', { frames: 30 })
  const standing = (await look('Player')).position
  await control('press', { action: 'jump' })
  await control('step', { frames: 20 })
  const rising = await look('Player')
  assert.ok(rising.position.y > standing.y + 0.5, `a jump must lift the Player above where it stood; ${JSON.stringify({ standing, rising: rising.position })}`)
  const jump = animationOf(rising)
  assert.equal(jump.state, 'jump', `rising must put the Player in jump; ${JSON.stringify(jump)}`)
  assert.equal(jump.clip, CLIPS.jump, `jumping must play the jump clip; ${JSON.stringify(jump)}`)
  await control('step', { frames: 90 })
  const landed = await look('Player')
  assert.equal(landed.body?.grounded, true, `the Player must land grounded; ${JSON.stringify(landed)}`)
  const back = animationOf(landed)
  assert.equal(back.state, 'idle', `landing must bring the Player back to idle; ${JSON.stringify(back)}`)
  assert.equal(back.clip, CLIPS.locomotion, `landing must play the Locomotion blend again; ${JSON.stringify(back)}`)
  return { jumpedTo: rising.position.y, landedY: landed.position.y, jumpState: jump.state, landedState: back.state }
}

/** CA-36: `look` turns the orbit camera 90°, after which up walks the Player toward +x, away from the camera. */
async function exerciseCameraRelative({ control, look }) {
  await control('look', { dx: QUARTER_TURN_DX, dy: 0 })
  // The camera turns in the step after the look; the motor reads its yaw from the step after that.
  await control('step', { frames: 1 })
  const before = (await look('Player')).position
  await control('hold', { action: 'up' })
  await control('step', { frames: 30 })
  await control('release', { action: 'up' })
  const after = (await look('Player')).position
  const moved = { dx: after.x - before.x, dz: after.z - before.z }
  assert.ok(moved.dx > 1.5, `up must walk the Player toward +x once the camera looks that way; ${JSON.stringify(moved)}`)
  assert.ok(Math.abs(moved.dz) < 0.1, `up must not walk the Player along z then; ${JSON.stringify(moved)}`)
  return moved
}

/**
 * The physics (the world ready with the scene's gravity, walking, jumping and
 * landing grounded), the animation (idle, walk and run through Locomotion,
 * the attack's fade, the jump clip) and the camera-relative movement, on the
 * demo with no skeleton to interfere.
 */
export async function exerciseSimulation(context, { gravity, inspector, renderBackend, keep, idleDuration }) {
  return withSession(context, withoutSkeletons, async (run) => {
    const player = await run.look('Player')
    assert.equal(player.physics?.state, 'ready', `the physics world must be ready; ${JSON.stringify(player.physics)}`)
    assert.deepEqual(player.physics.gravity, gravity, 'the snapshot reports the scene gravity')
    await run.control('step', { frames: 20 })
    const idle = await exerciseIdle(run, { inspector, renderBackend, keep, idleDuration })
    const walk = await exerciseWalk(run)
    const running = await exerciseRun(run)
    const attack = await exerciseAttack(run)
    const jump = await exerciseJump(run)
    const cameraRelative = await exerciseCameraRelative(run)
    return {
      walked: walk.walked,
      jumpedTo: jump.jumpedTo,
      landedY: jump.landedY,
      cameraRelative,
      animation: {
        idleDelta: idle.delta,
        differingIdlePixels: idle.differingIdlePixels,
        walkYaw: walk.walkYaw,
        run: running,
        attack,
        states: ['idle', walk.walkState, running.runState, 'attack', jump.jumpState, jump.landedState],
      },
    }
  })
}

/** CA-36: with the Player against the south wall, the camera behind it sits in front of the wall, nearer than its chosen distance. */
export async function exerciseCameraCollision(context) {
  const byTheWall = (scene) => {
    withoutSkeletons(scene)
    scene.entities.find((entity) => entity.name === 'Player').position = [0, 0, 8.6]
  }
  return withSession(context, byTheWall, async ({ control }) => {
    await control('step', { frames: 5 })
    const inspected = await context.helpers.call(context.client, 'inspect_runtime', { project_path: context.project, entity_names: ['Player'] })
    const { view } = inspected.structuredContent.snapshot
    assert.equal(view.follow, 'Player', `the snapshot's view must report the followed Player; ${JSON.stringify(view)}`)
    assert.ok(view.distanceActual < view.distance, `a wall behind the Player must pull the camera in; ${JSON.stringify(view)}`)
    return { distance: view.distance, distanceActual: view.distanceActual }
  })
}
