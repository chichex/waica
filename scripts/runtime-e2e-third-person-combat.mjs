// Issue #181 CA-36: the third-person demo's fight and respawn, played through
// the Runtime Bridge one Simulation Step at a time: a skeleton's strike lands,
// a roll through the next one leaves the Player's health as it was, the
// Player's own strikes kill the skeleton, and a Player killed after touching a
// checkpoint comes back there with full health.
import assert from 'node:assert/strict'
import { withSession } from './runtime-e2e-third-person-play.mjs'

/** What the fight reads each step: each named entity's state, health and position, from one snapshot. */
async function peek({ helpers, client, project }, names) {
  const inspected = await helpers.call(client, 'inspect_runtime', { project_path: project, entity_names: names })
  assert.equal(inspected.isError, undefined, `inspect_runtime failed: ${JSON.stringify(inspected)}`)
  const stateOf = (entity, type) => entity.components.find((component) => component.type === type)?.state
  const read = (name) => {
    const entity = inspected.structuredContent.snapshot.entities.find((candidate) => candidate.name === name)
    assert.ok(entity, `the snapshot must hold ${name}`)
    return { state: stateOf(entity, 'StateMachine')?.current, health: stateOf(entity, 'Health'), checkpoint: stateOf(entity, 'Checkpoint'), position: entity.transform.position }
  }
  return Object.fromEntries(names.map((name) => [name, read(name)]))
}

/** Steps one frame at a time until `done(peeked)` holds, at most `limit` frames; returns that snapshot. */
async function stepUntil(context, run, { names, done, limit, what }) {
  for (let frame = 0; frame <= limit; frame += 1) {
    const peeked = await peek(context, names)
    if (done(peeked)) return peeked
    await run.control('step')
  }
  throw new Error(`${what} never happened within ${limit} frames`)
}

const FIGHTERS = ['Player', 'Skeleton Gate']
const planar = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

/** The direction Action that walks the Player toward `to` with the camera looking toward -z. */
function toward(from, to) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'right' : 'left'
  return dz > 0 ? 'down' : 'up'
}

/** One skeleton 2.5 in front of the Player, which can take twenty hits. */
const duel = (scene) => {
  scene.entities = scene.entities.filter((entity) => entity.prefab !== 'characters/skeleton' || entity.name === 'Skeleton Gate')
  scene.entities.find((entity) => entity.name === 'Skeleton Gate').position = [0, 0, 4.5]
  scene.entities.find((entity) => entity.name === 'Player').overrides = { Health: { max: 20 } }
}

/** The skeleton's first strike lands: the Player's health drops in the step its attack begins. */
async function strikeLands(context, run) {
  const struck = await stepUntil(context, run, { names: FIGHTERS, done: (seen) => seen['Skeleton Gate'].state === 'attack', limit: 400, what: "the skeleton's first strike" })
  const { health } = struck.Player
  assert.ok(health.current < health.max, `a skeleton's strike must land on the Player; ${JSON.stringify(struck)}`)
  return health.current
}

/** The next strike meets the Player mid-roll, dodging into the skeleton so the strike still reaches it: its health stays as it was. */
async function rollThroughStrike(context, run, health) {
  const winding = await stepUntil(context, run, { names: FIGHTERS, done: (seen) => seen['Skeleton Gate'].state === 'windup', limit: 400, what: 'the next windup' })
  // The strike comes 36 steps into the windup; a 30-step roll started 6 before it covers it.
  await run.control('step', { frames: 30 })
  const action = toward(winding.Player.position, winding['Skeleton Gate'].position)
  await run.control('hold', { action })
  await run.control('press', { action: 'dodge' })
  const striking = await stepUntil(context, run, { names: FIGHTERS, done: (seen) => seen['Skeleton Gate'].state === 'attack', limit: 30, what: 'the strike during the roll' })
  await run.control('release', { action })
  assert.equal(striking.Player.state, 'roll', `the strike must meet the Player mid-roll; ${JSON.stringify(striking)}`)
  await run.control('step', { frames: 3 })
  const after = await peek(context, FIGHTERS)
  assert.equal(after.Player.health.current, health, `a strike during the roll must leave the Player's health as it was; ${JSON.stringify({ striking, after })}`)
  assert.ok(planar(striking.Player.position, striking['Skeleton Gate'].position) <= 1.6, `the roll must keep the Player within the strike's reach; ${JSON.stringify(striking)}`)
  return after.Player.health.current
}

/** The Player closes in and strikes until the skeleton is in its die state. */
async function killSkeleton(context, run) {
  for (let round = 0; round < 12; round += 1) {
    const seen = await peek(context, FIGHTERS)
    if (seen['Skeleton Gate'].state === 'die') return { rounds: round, skeleton: seen['Skeleton Gate'] }
    const action = toward(seen.Player.position, seen['Skeleton Gate'].position)
    await run.control('hold', { action })
    await stepUntil(context, run, { names: FIGHTERS, done: (now) => planar(now.Player.position, now['Skeleton Gate'].position) <= 1.4, limit: 60, what: 'closing in' })
    await run.control('release', { action })
    await run.control('press', { action: 'attack' })
    await run.control('step', { frames: 70 })
  }
  throw new Error(`the skeleton never reached its die state; ${JSON.stringify(await peek(context, FIGHTERS))}`)
}

/** CA-36: a strike lands, a roll through the next leaves the health as it was, and the Player kills the skeleton. */
export async function exerciseCombat(context) {
  return withSession(context, duel, async (run) => {
    const hit = await strikeLands(context, run)
    const rolled = await rollThroughStrike(context, run, hit)
    const killed = await killSkeleton(context, run)
    return { healthAfterHit: hit, healthAfterRoll: rolled, rounds: killed.rounds, skeletonState: killed.skeleton.state }
  })
}

/** One skeleton near Checkpoint West, and a Player one hit from death. */
const ambush = (scene) => {
  scene.entities = scene.entities.filter((entity) => entity.prefab !== 'characters/skeleton' || entity.name === 'Skeleton West')
  scene.entities.find((entity) => entity.name === 'Skeleton West').position = [-7, 0, 1]
  const player = scene.entities.find((entity) => entity.name === 'Player')
  // On Checkpoint West's line, so walking left enters its sensor.
  player.position = [0, 0, 6]
  player.overrides = { Health: { max: 1 } }
}

const RESPAWN = ['Player', 'Checkpoint West']

/** CA-36: the Player touches Checkpoint West, dies to the skeleton, and comes back there with full health. */
export async function exerciseRespawn(context) {
  return withSession(context, ambush, async (run) => {
    await run.control('hold', { action: 'left' })
    const touched = await stepUntil(context, run, { names: RESPAWN, done: (seen) => seen['Checkpoint West'].checkpoint?.active === true, limit: 150, what: 'touching Checkpoint West' })
    await run.control('release', { action: 'left' })
    await stepUntil(context, run, { names: RESPAWN, done: (seen) => seen.Player.state === 'die', limit: 600, what: "the Player's death" })
    const back = await stepUntil(context, run, { names: RESPAWN, done: (seen) => seen.Player.state === 'idle', limit: 400, what: 'the respawn' })
    const checkpoint = touched['Checkpoint West'].position
    assert.ok(planar(back.Player.position, checkpoint) < 0.6, `the Player must come back at the checkpoint; ${JSON.stringify({ back, checkpoint })}`)
    assert.equal(back.Player.health.current, back.Player.health.max, `the Player must come back with full health; ${JSON.stringify(back.Player.health)}`)
    return { respawnedAt: back.Player.position, checkpoint, health: back.Player.health.current }
  })
}
