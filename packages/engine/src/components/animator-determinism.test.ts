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

describe('the animation is deterministic (issue #166 CA-8)', () => {
  it('gives two Games loading the same scene bit-identical bones after 120 steps of walk', async () => {
    const first = await walkingRig()
    const second = await walkingRig()

    step(first, 120)
    step(second, 120)

    expect(poses(first)).toEqual(poses(second))
    expect(poses(first)).toHaveLength(3)
    // The clip actually ran: a leg is away from its bind pose.
    expect(defined(poses(first)[1])).not.toEqual([0, 0, 0, 1, 0.175, 0.9, 0])
  })

  it('reaches the committed pose hash on every platform: the rig walking for 120 steps', async () => {
    const game = await walkingRig()

    step(game, 120)

    expect(poseDigest(game)).toBe('2048328551eace076b1cec6886dc73c1')
  })
})
