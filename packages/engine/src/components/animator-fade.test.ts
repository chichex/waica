// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { use3dTestEnvironment } from '../test-game-3d.js'
import { animatedRig, bonesOf, quaternionOf, rigEntity, rigGame, step } from '../test-rig.js'
import { defined, match } from '../test-support.js'
import type { Game } from '../game.js'
import { Animator } from './animator.js'

// Issue #205: a fade of its own per clip, an interrupted fade that leaves from
// the weight it had, and a clip asked for again that continues from its time.

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

const animatorOf = (game: Game, name: string): Animator => defined(defined(game.find(name)).get(Animator))
const legOf = (game: Game, name: string): number[] => quaternionOf(defined(bonesOf(defined(game.find(name)))[1]))
const weightsOf = (animator: Animator): Record<string, number> => animator.inspectState().weights

describe('a fade-in of its own per clip (issue #205 CA-1)', () => {
  it('cuts into a clip whose own fade is 0 under a global 0.15: one step later the pose is that of an entity that only played it', async () => {
    const game = await rigGame([rigEntity('Cut', { fade: 0.15, clips: { jump: { fade: 0 } } }), rigEntity('Fresh', { fade: 0.15 })])
    await game.assets.ready()
    animatorOf(game, 'Cut').play('walk')
    step(game, 10)
    animatorOf(game, 'Cut').play('jump')
    animatorOf(game, 'Fresh').play('jump')
    step(game, 1)

    expect(legOf(game, 'Cut')).toEqual(legOf(game, 'Fresh'))
    expect(weightsOf(animatorOf(game, 'Cut'))).toEqual({ jump: 1 })
  })

  it('fades into a clip over its own 0.5 s: half its weight after 15 steps', async () => {
    const { game, animator } = await animatedRig({ clips: { jump: { fade: 0.5 } } })
    animator.play('walk')
    step(game, 10)
    animator.play('jump')
    step(game, 15)

    expect(weightsOf(animator)).toEqual({ walk: match.closeTo(0.5, 6), jump: match.closeTo(0.5, 6) })
  })

  it('fades into a clip without an override over the Animator’s fade, whatever other clips override', async () => {
    const { game, animator } = await animatedRig({ fade: 0.3, clips: { idle: { fade: 0 } } })
    animator.play('walk')
    step(game, 10)
    animator.play('jump')
    step(game, 9)

    // 9 steps of a 0.3 s fade: 0.15 s, half way.
    expect(weightsOf(animator)).toEqual({ walk: match.closeTo(0.5, 6), jump: match.closeTo(0.5, 6) })
  })
})

describe('an interrupted fade leaves from the weight each clip had (issue #205 CA-2)', () => {
  it('walk 10 steps, jump 5, then idle: no leaving clip ever gains weight, jump starts down from where it was and the weights sum to 1', async () => {
    const { game, animator } = await animatedRig({})
    const trace: Record<string, number>[] = []
    const run = (frames: number): void => {
      for (let frame = 0; frame < frames; frame += 1) {
        step(game, 1)
        trace.push(weightsOf(animator))
      }
    }
    animator.play('walk')
    run(10)
    animator.play('jump')
    run(5)
    const jumpBefore = defined(defined(trace.at(-1)).jump)
    animator.play('idle')
    run(12)

    // Five steps into a 0.15 s fade: 5/9 of the way.
    expect(jumpBefore).toBeCloseTo(5 / 9, 9)
    const jumpAtInterruption = defined(defined(trace[15]).jump)
    expect(jumpAtInterruption).toBeGreaterThan(0)
    expect(jumpAtInterruption).toBeLessThanOrEqual(jumpBefore)
    // walk leaves from step 11, jump from step 16: neither weight rises again.
    for (const [clip, leavesAt] of [['walk', 10], ['jump', 15]] as const) {
      for (let index = leavesAt + 1; index < trace.length; index += 1) {
        expect(defined(trace[index])[clip] ?? 0, `${clip} at step ${index + 1}`).toBeLessThanOrEqual(defined(trace[index - 1])[clip] ?? 0)
      }
    }
    for (const [index, weights] of trace.entries()) {
      const sum = Object.values(weights).reduce((total, weight) => total + weight, 0)
      expect(sum, `the sum at step ${index + 1}`).toBeGreaterThanOrEqual(0.999)
      expect(sum, `the sum at step ${index + 1}`).toBeLessThanOrEqual(1.001)
    }
    expect(trace.at(-1)).toEqual({ idle: 1 })
  })
})

describe('a clip asked for again continues from its time (issue #205 CA-3)', () => {
  it('walk 10 steps, idle 3 with walk still sounding, then walk: walk goes on from its time instead of 0', async () => {
    const { game, animator } = await animatedRig({})
    animator.play('walk')
    step(game, 10)
    const before = animator.inspectState().time
    animator.play('idle')
    step(game, 3)
    expect(weightsOf(animator).walk).toBeGreaterThan(0)
    animator.play('walk')
    step(game, 1)

    expect(animator.current).toBe('walk')
    expect(animator.inspectState().time).toBeGreaterThan(before)
    expect(animator.inspectState().time).toBeCloseTo(14 / 60, 9)
  })

  it('restarts at 0 a clip whose weight had reached 0', async () => {
    const { game, animator } = await animatedRig({})
    animator.play('walk')
    step(game, 10)
    animator.play('idle')
    step(game, 20)
    expect(weightsOf(animator)).toEqual({ idle: 1 })
    animator.play('walk')
    step(game, 1)

    expect(animator.inspectState().time).toBeCloseTo(1 / 60, 9)
  })

  it('restarts at 0 a finished one-shot asked for again while it still fades out', async () => {
    const { game, animator } = await animatedRig({ clips: { jump: { loop: false } } })
    animator.play('jump')
    step(game, 31)
    expect(animator.clipFinished).toBe(true)
    animator.play('idle')
    step(game, 2)
    expect(weightsOf(animator).jump).toBeGreaterThan(0)
    animator.play('jump')
    step(game, 1)

    expect(animator.clipFinished).toBe(false)
    expect(animator.inspectState().time).toBeCloseTo(1 / 60, 9)
  })
})
