// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import * as THREE from 'three/webgpu'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { animatedRig, rigGame, RIG_URL, step } from '../test-rig.js'
import { defined, match } from '../test-support.js'
import { Animator } from './animator.js'

// Issue #205: a blend is a virtual clip of the Animator, mixing the file's
// clips by a named parameter, phase-synced.

use3dTestEnvironment()

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The rig's three clips on one parameter: idle at 0, walk at 1, jump at 2. */
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0 }

describe('a blend is a virtual clip of the Animator (issue #205 CA-4)', () => {
  it('joins clipNames after the file’s clips, plays as current and never finishes', async () => {
    const { game, animator } = await animatedRig({ blends: { Move: MOVE } })
    expect(animator.clipNames).toEqual(['idle', 'walk', 'jump', 'Move'])

    animator.play('Move')
    expect(animator.current).toBe('Move')
    for (let frame = 0; frame < 150; frame += 1) {
      step(game, 1)
      expect(animator.clipFinished).toBe(false)
    }
  })

  it('is what a StateMachine state plays when its clip names it, with no missing-clip warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = await rigGame([
      {
        name: 'Mover',
        components: [
          { type: 'Model', props: { src: RIG_URL } },
          { type: 'Animator', props: { blends: { Move: MOVE } } },
          { type: 'StateMachine', props: { initial: 'move', states: { move: { clip: 'Move' } } } },
        ],
      },
    ])
    await game.assets.ready()
    step(game, 2)

    expect(defined(defined(game.find('Mover')).get(Animator)).current).toBe('Move')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('the weights of a 1D blend (issue #205 CA-5)', () => {
  it.each([
    [0.25, { idle: 0.75, walk: 0.25 }],
    [1.5, { walk: 0.5, jump: 0.5 }],
    [-1, { idle: 1 }],
    [5, { jump: 1 }],
  ])('speed %s mixes the two neighbouring points linearly and clamps past the ends', async (speed, expected) => {
    const { game, animator } = await animatedRig({ blends: { Move: MOVE } })
    animator.play('Move')
    animator.setParam('speed', speed)
    step(game, 1)

    const close = Object.fromEntries(Object.entries(expected).map(([clip, weight]) => [clip, match.closeTo(weight, 9)]))
    expect(animator.inspectState().weights).toEqual(close)
  })

  it('reads 0 for a parameter nobody wrote', async () => {
    const { game, animator } = await animatedRig({ blends: { Move: MOVE } })
    animator.play('Move')
    step(game, 3)

    expect(animator.inspectState().weights).toEqual({ idle: 1 })
    expect(animator.inspectState().params).toEqual({ speed: 0 })
  })

  it('keeps a setParam made before the file loaded and applies it once it settles', async () => {
    const game = await rigGame([{ name: 'Early', components: [{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: { blends: { Move: MOVE } } }] }])
    const animator = defined(defined(game.find('Early')).get(Animator))
    animator.setParam('speed', 1.5)
    animator.play('Move')
    expect(animator.clipNames).toEqual([])

    await game.assets.ready()
    step(game, 1)
    expect(animator.inspectState().weights).toEqual({ walk: match.closeTo(0.5, 9), jump: match.closeTo(0.5, 9) })
  })
})

describe('the parameter approaches its target smoothly (issue #205 CA-6)', () => {
  it('moves a ninth of the way per step with smoothing 0.15, rises monotonically and snaps to 1 at step 79', async () => {
    const { game, animator } = await animatedRig({ blends: { Move: { ...MOVE, smoothing: 0.15 } } })
    animator.play('Move')
    animator.setParam('speed', 1)
    const trace: number[] = []
    for (let frame = 0; frame < 80; frame += 1) {
      step(game, 1)
      trace.push(defined(animator.inspectState().params.speed))
    }

    // α = (1/60) / 0.15 = 1/9.
    expect(Math.abs(defined(trace[0]) - 1 / 9)).toBeLessThan(1e-9)
    for (let index = 1; index < trace.length; index += 1) expect(defined(trace[index])).toBeGreaterThanOrEqual(defined(trace[index - 1]))
    // (8/9)^78 ≈ 1.02e-4 stays above the 1e-4 snap; (8/9)^79 ≈ 9.07e-5 falls under it.
    expect(defined(trace[77])).toBeLessThan(1)
    expect(defined(trace[78])).toBe(1)
  })

  it('follows at once with smoothing 0', async () => {
    const { animator } = await animatedRig({ blends: { Move: MOVE } })
    animator.setParam('speed', 1.25)

    expect(animator.inspectState().params).toEqual({ speed: 1.25 })
  })
})

/** The blend's own actions: the ones the mixer plays once only the blend sounds. */
function playingActions(created: THREE.AnimationAction[]): THREE.AnimationAction[] {
  return created.filter((action) => action.isScheduled())
}

describe('the clips of a blend share one phase (issue #205 CA-7)', () => {
  /** walk (0.8 s) and idle (1 s), half and half. */
  const HALVES = { param: 'mix', points: [{ clip: 'walk', at: 0 }, { clip: 'idle', at: 1 }], smoothing: 0 }

  it.each([
    { label: 'no speed override', clips: {}, cycleSteps: 54, cycle: 0.9 },
    { label: 'walk at speed 2', clips: { walk: { speed: 2 } }, cycleSteps: 42, cycle: 0.7 },
  ])('keeps both clips at the same normalized time every step and comes back to phase 0 after one interpolated cycle ($label)', async ({ clips, cycleSteps, cycle }) => {
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, 'clipAction')
    const { game, animator } = await animatedRig({ clips, blends: { Halves: HALVES } })
    const created = clipAction.mock.results.flatMap((result) => (result.type === 'return' && result.value ? [result.value] : []))
    animator.setParam('mix', 0.5)
    animator.play('Halves')

    const actions = playingActions(created)
    expect(actions.map((action) => action.getClip().name).sort()).toEqual(['idle', 'walk'])
    for (let frame = 1; frame <= cycleSteps; frame += 1) {
      step(game, 1)
      const [first, second] = actions.map((action) => action.time / action.getClip().duration)
      expect(Math.abs(defined(first) - defined(second)), `step ${frame}`).toBeLessThan(1e-6)
    }
    const time = animator.inspectState().time
    expect(Math.min(time, cycle - time)).toBeLessThan(1e-6)
  })

  it('reports half the cycle as the time half way through it', async () => {
    const { game, animator } = await animatedRig({ blends: { Halves: HALVES } })
    animator.setParam('mix', 0.5)
    animator.play('Halves')
    step(game, 27)

    expect(animator.inspectState().time).toBeCloseTo(0.45, 6)
    expect(animator.clipProgress).toBeCloseTo(0.5, 6)
  })
})

describe('a blend’s name and points at runtime: each case warns once per entity and never throws (issue #205 CA-10)', () => {
  it('lets a clip of the file win over a blend of the same name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, animator } = await animatedRig({ blends: { walk: MOVE } })
    expect(animator.clipNames).toEqual(['idle', 'walk', 'jump'])
    animator.play('walk')
    step(game, 1)

    expect(animator.inspectState().weights).toEqual({ walk: 1 })
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual(['[waica] "Rig": blend "walk" has the name of a clip of the file; the clip plays'])
  })

  it('skips a point whose clip the file lacks or that names another blend', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const points = [{ clip: 'idle', at: 0 }, { clip: 'run', at: 1 }, { clip: 'Other', at: 2 }]
    const { game, animator } = await animatedRig({ blends: { Move: { param: 'speed', points, smoothing: 0 }, Other: MOVE } })
    animator.play('Move')
    animator.setParam('speed', 1.5)
    step(game, 1)

    expect(animator.inspectState().weights).toEqual({ idle: 1 })
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      '[waica] "Rig": blend "Move" skips point "run": the file has no such clip',
      '[waica] "Rig": blend "Move" skips point "Other": the file has no such clip',
    ])
  })

})

describe('a blend left with nothing to play at runtime (issue #205 CA-10)', () => {
  it('treats a blend with no playable point as an unknown clip', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, animator } = await animatedRig({ initialClip: 'idle', blends: { Empty: { param: 'speed', points: [{ clip: 'run', at: 0 }] } } })
    expect(animator.clipNames).toEqual(['idle', 'walk', 'jump'])
    animator.play('Empty')
    animator.play('Empty')
    step(game, 1)

    expect(animator.current).toBe('idle')
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      '[waica] "Rig": blend "Empty" skips point "run": the file has no such clip',
      '[waica] "Rig": blend "Empty" has no point to play; it does not play',
      '[waica] "Rig": no clip "Empty"',
    ])
  })

})

describe('a parameter or a fade that is not a number at runtime (issue #205 CA-10)', () => {
  it('ignores a setParam that is not a finite number', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { animator } = await animatedRig({ blends: { Move: MOVE } })
    animator.setParam('speed', 1)
    expect(() => animator.setParam('speed', Number.NaN)).not.toThrow()
    animator.setParam('speed', Number.POSITIVE_INFINITY)

    expect(animator.inspectState().params).toEqual({ speed: 1 })
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual(['[waica] "Rig": setParam("speed") needs a finite number; ignored'])
  })

  it('fades over the global fade into a clip whose own fade is negative or not finite', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, animator } = await animatedRig({ fade: 0.15, clips: { jump: { fade: -1 }, idle: { fade: 'soon' } } })
    animator.play('walk')
    step(game, 10)
    animator.play('jump')
    step(game, 3)
    expect(animator.inspectState().weights).toEqual({ walk: match.closeTo(2 / 3, 9), jump: match.closeTo(1 / 3, 9) })
    animator.play('idle')
    animator.play('jump')
    animator.play('idle')

    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      '[waica] "Rig": clips.jump.fade must be a number of seconds ≥ 0; fading over 0.15',
      '[waica] "Rig": clips.idle.fade must be a number of seconds ≥ 0; fading over 0.15',
    ])
  })
})
