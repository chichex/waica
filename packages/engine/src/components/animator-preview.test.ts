// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { animatedRig, bonesOf, quaternionOf, RIG_URL, rigGame, step } from '../test-rig.js'
import { defined, match } from '../test-support.js'
import { Animator } from './animator.js'
import { Model } from './model.js'

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

describe('Animator.previewStep follows its Model while the Game does not simulate (issue #205 CA-22)', () => {
  it('attaches to a Model listed after it, which onReady could not see', async () => {
    const game = await rigGame([{ name: 'Late', components: [{ type: 'Animator', props: { initialClip: 'walk' } }, { type: 'Model', props: { src: RIG_URL } }] }])
    game.simulate = false
    const animator = defined(defined(game.find('Late')).get(Animator))
    await game.assets.ready()
    animator.previewStep(1 / 60)
    await game.assets.ready()
    animator.previewStep(1 / 60)

    expect(animator.inspectState()).toMatchObject({ loaded: true, current: 'walk' })
  })

  it('moves to the new clone of a Model whose src was set again, and animates that one', async () => {
    const { game, entity, animator } = await animatedRig({})
    game.simulate = false
    const model = defined(entity.get(Model))
    model.src = RIG_URL
    await game.assets.ready()
    const rest = quaternionOf(defined(bonesOf(entity)[1]))
    animator.previewStep(1 / 60)
    await game.assets.ready()
    animator.play('walk')
    for (let frame = 0; frame < 12; frame += 1) animator.previewStep(1 / 60)

    expect(quaternionOf(defined(bonesOf(entity)[1]))).not.toEqual(rest)
  })
})

describe('Animator.previewReset ends a preview as a freshly built stage starts (issue #205 CA-21)', () => {
  /** A rig whose Animator previewed Move at 2 for 12 steps, with its leg's pose before the preview. */
  async function previewed(animator: Record<string, unknown>) {
    const rig = await animatedRig({ blends: { Move: MOVE }, ...animator })
    rig.game.simulate = false
    const rest = quaternionOf(defined(bonesOf(rig.entity)[1]))
    rig.animator.setParam('speed', 2)
    rig.animator.play('Move')
    for (let frame = 0; frame < 12; frame += 1) rig.animator.previewStep(1 / 60)
    expect(quaternionOf(defined(bonesOf(rig.entity)[1]))).not.toEqual(rest)
    return { ...rig, rest }
  }

  it('forgets the parameters, puts the rig back in its built pose and asks for the initial clip again, a blend included', async () => {
    const { entity, animator, rest } = await previewed({ initialClip: 'Move' })
    animator.previewReset()

    expect(animator.inspectState()).toMatchObject({ current: 'Move', params: { speed: 0 }, weights: { idle: 1 } })
    expect(quaternionOf(defined(bonesOf(entity)[1]))).toEqual(rest)
  })

  it('leaves an Animator without an initial clip playing nothing, in its built pose', async () => {
    const { entity, animator, rest } = await previewed({})
    animator.previewReset()

    expect(animator.inspectState()).toMatchObject({ current: null, playing: false, weights: {} })
    expect(quaternionOf(defined(bonesOf(entity)[1]))).toEqual(rest)
  })

  it('does nothing while the Game simulates', async () => {
    const { game, animator } = await animatedRig({ initialClip: 'walk', blends: { Move: MOVE } })
    animator.setParam('speed', 2)
    animator.play('Move')
    step(game, 3)
    const before = animator.inspectState()
    animator.previewReset()

    expect(animator.inspectState()).toEqual(before)
  })
})

