// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { animatedRig, bonesOf, quaternionOf, step } from '../test-rig.js'
import { defined, match } from '../test-support.js'
import { Animator } from './animator.js'

// Issue #205 CA-22: the editor previews a blend in edit mode through previewStep.

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0.15 }

describe('Animator.previewStep advances the Animator alone while the Game does not simulate (issue #205 CA-22)', () => {
  it('steps the parameters, the fades and the mixer in edit mode: 12 preview steps of walk reach the 15° keyframe', async () => {
    const { game, entity, animator } = await animatedRig({ blends: { Move: MOVE } })
    game.simulate = false
    animator.play('walk')
    const hashes: string[] = []
    for (let frame = 0; frame < 12; frame += 1) {
      animator.previewStep(1 / 60)
      step(game, 1)
      hashes.push(animator.inspectState().poseHash)
    }

    expect(new Set(hashes).size).toBe(12)
    expect(defined(quaternionOf(defined(bonesOf(entity)[1]))[0])).toBeCloseTo(0.2588, 3)
    animator.play('Move')
    animator.setParam('speed', 1)
    animator.previewStep(1 / 60)
    expect(animator.inspectState().params).toEqual({ speed: match.closeTo(1 / 9, 9) })
  })

  it('does nothing while the Game simulates, where onUpdate steps it', async () => {
    const { animator } = await animatedRig({ initialClip: 'walk' })
    const before = animator.inspectState()
    animator.previewStep(1 / 60)
    animator.previewStep(1 / 60)

    expect(animator.inspectState()).toEqual(before)
  })

  it('keeps its runtime fields out of the authored ones: its defaults stay initialClip, fade, clips and blends', () => {
    expect(authoringDefaults(Animator)).toEqual({ initialClip: '', fade: 0.15, clips: {}, blends: {} })
    expect(Animator.transient).toEqual(expect.arrayContaining(['sources', 'mix', 'params']))
  })
})
