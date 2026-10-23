// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { use3dTestEnvironment } from '../test-game-3d.js'
import { md5 } from '../test-md5.js'
import { bonesOf, rigEntity, rigGame, step } from '../test-rig.js'
import { defined } from '../test-support.js'
import type { Game } from '../game.js'
import { Animator } from './animator.js'

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A Game whose one entity draws the rig and walks from the start. */
async function walkingRig(): Promise<Game> {
  const game = await rigGame([rigEntity('Walker', { initialClip: 'walk' })])
  await game.assets.ready()
  return game
}

/** Every bone's quaternion and position, in skeleton order, exactly as three holds them. */
function poses(game: Game): number[][] {
  return bonesOf(defined(game.find('Walker'))).map((bone) => [...bone.quaternion.toArray(), ...bone.position.toArray()])
}

/** md5 of every bone's quaternion and position rounded to 1e-6, in skeleton order. */
function poseDigest(game: Game): string {
  const rounded = (value: number): string => (Math.round(value * 1e6) / 1e6).toFixed(6)
  return md5(poses(game).map((pose) => pose.map(rounded).join(',')).join(';'))
}

/** The digest of the rig's bind pose (root at the origin, each leg at its hang point, every rotation identity): what a mixer that never ran would give. */
const BIND_DIGEST = md5(
  [
    '0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.000000',
    '0.000000,0.000000,0.000000,1.000000,0.175000,0.900000,0.000000',
    '0.000000,0.000000,0.000000,1.000000,-0.175000,0.900000,0.000000',
  ].join(';'),
)

describe('the animation is deterministic (issue #166 CA-8)', () => {
  // 110 steps = 1.8333 s: two walk cycles (0.8 s each) and 0.2333 s into the
  // third, between the swing keyframe at 0.2 s and the identity at 0.4 s. A
  // multiple of 0.4 s would land on an identity keyframe, where a mixer that
  // never ran gives the same bones (review of PR #168).
  const STEPS = 110

  it('gives two Games loading the same scene bit-identical bones after 110 steps of walk', async () => {
    const first = await walkingRig()
    const second = await walkingRig()

    step(first, STEPS)
    step(second, STEPS)

    expect(poses(first)).toEqual(poses(second))
    expect(poses(first)).toHaveLength(3)
    // The clip actually ran: a leg is well away from its bind pose, not a float hair from it.
    expect(Math.abs(defined(defined(poses(first)[1])[0]))).toBeGreaterThan(0.1)
  })

  it('reaches the committed pose hash on every platform: the rig walking for 110 steps', async () => {
    const game = await walkingRig()

    step(game, STEPS)

    const digest = poseDigest(game)
    expect(digest).not.toBe(BIND_DIGEST)
    expect(digest).toBe('9c47039d9040fbe2f2bc994e2c57fa31')
  })
})

/** A Game whose one entity mixes: per-clip fades and a blend over the rig's three clips. */
async function mixingRig(): Promise<Game> {
  const game = await rigGame([
    rigEntity('Walker', {
      fade: 0.2,
      clips: { jump: { fade: 0.3 }, Move: { fade: 0.1 } },
      blends: { Move: { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0.15 } },
    }),
  ])
  await game.assets.ready()
  return game
}

/** What the script does at a step: plays, interrupts fades and changes the parameter. */
const SCRIPT = new Map<number, (animator: Animator) => void>([
  [0, (animator) => animator.play('walk')],
  [20, (animator) => {
    animator.setParam('speed', 0.7)
    animator.play('Move')
  }],
  [26, (animator) => animator.setParam('speed', 1.6)],
  [40, (animator) => animator.play('jump')],
  [45, (animator) => animator.play('Move')],
  [70, (animator) => animator.setParam('speed', 0.2)],
  [90, (animator) => animator.play('idle')],
  [93, (animator) => animator.play('Move')],
])

describe('the mixing is deterministic (issue #205 CA-9)', () => {
  it('gives two Games bit-identical bones after 120 steps of a blend, per-clip fades, interrupted fades and parameter changes', async () => {
    const games = [await mixingRig(), await mixingRig()]
    for (const game of games) {
      const animator = defined(defined(game.find('Walker')).get(Animator))
      for (let frame = 0; frame < 120; frame += 1) {
        SCRIPT.get(frame)?.(animator)
        step(game, 1)
      }
    }
    const [first, second] = games.map((game) => poses(defined(game)))

    expect(first).toEqual(second)
    expect(poseDigest(defined(games[0]))).not.toBe(BIND_DIGEST)
  })
})
