// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { AnimatorState } from './components/animator.js'
import type { RuntimeSnapshot } from './runtime-inspection.js'
import { runtimeBridgeOf, use3dTestEnvironment } from './test-game-3d.js'
import { Animator } from './components/animator.js'
import { rigEntity, rigGame } from './test-rig.js'
import { defined, match } from './test-support.js'

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The issue #166 fields of the Animator's state of the one rig entity in a snapshot, as inspect_runtime projects it, read field by field. */
function animatorStateOf(snapshot: RuntimeSnapshot): Pick<AnimatorState, 'loaded' | 'current' | 'time' | 'playing' | 'poseHash'> {
  const entity = defined(snapshot.entities.find((candidate) => candidate.name === 'Walker'))
  const component = defined(entity.components.find((candidate) => candidate.type === 'Animator'))
  const state = component.state
  if (typeof state !== 'object' || state === null || Array.isArray(state)) throw new Error('the Animator state must be an object')
  const record: Record<string, unknown> = state
  return {
    loaded: record.loaded === true,
    current: typeof record.current === 'string' ? record.current : null,
    time: typeof record.time === 'number' ? record.time : Number.NaN,
    playing: record.playing === true,
    poseHash: typeof record.poseHash === 'string' ? record.poseHash : '?',
  }
}

describe('Animator in the Runtime Snapshot (issue #166 CA-10)', () => {
  it('reports loaded, current, the clip time in seconds, playing and a pose hash that changes as the clip runs', async () => {
    const game = await rigGame([rigEntity('Walker', { initialClip: 'walk' })])
    const bridge = runtimeBridgeOf(game)
    await game.assets.ready()

    bridge.control({ operation: 'step', frames: 10 })
    const at10 = animatorStateOf(bridge.inspect())
    expect(at10).toMatchObject({ loaded: true, current: 'walk', playing: true })
    expect(Math.abs(at10.time - 10 / 60)).toBeLessThan(1e-6)
    expect(at10.poseHash).toMatch(/^[0-9a-f]{8}$/)

    bridge.control({ operation: 'step', frames: 10 })
    const at20 = animatorStateOf(bridge.inspect())
    expect(Math.abs(at20.time - 20 / 60)).toBeLessThan(1e-6)
    expect(at20.poseHash).not.toBe(at10.poseHash)
  })

  it('reports not loaded, no clip and an empty hash before the model settles', async () => {
    const game = await rigGame([rigEntity('Walker', { initialClip: 'walk' })])
    const bridge = runtimeBridgeOf(game)

    expect(animatorStateOf(bridge.inspect())).toEqual({ loaded: false, current: null, time: 0, playing: false, poseHash: '' })
  })
})

/** The Animator's projected state of the rig entity, as the plain record inspect_runtime gives. */
function projectedAnimator(snapshot: RuntimeSnapshot): Record<string, unknown> {
  const entity = defined(snapshot.entities.find((candidate) => candidate.name === 'Walker'))
  const state = defined(entity.components.find((candidate) => candidate.type === 'Animator')).state
  if (typeof state !== 'object' || state === null || Array.isArray(state)) throw new Error('the Animator state must be an object')
  return { ...state }
}

/** idle (1 s) and walk (0.8 s) on one parameter, with no smoothing. */
const HALVES = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }], smoothing: 0 }

describe('Animator weights and params in the Runtime Snapshot (issue #205 CA-8)', () => {
  it('names the blend as current, its phase in seconds of the interpolated cycle as time, the clips’ weights and the smoothed params', async () => {
    const game = await rigGame([rigEntity('Walker', { blends: { Halves: HALVES } })])
    const bridge = runtimeBridgeOf(game)
    await game.assets.ready()
    const animator = defined(defined(game.find('Walker')).get(Animator))
    animator.setParam('speed', 0.5)
    animator.play('Halves')

    bridge.control({ operation: 'step', frames: 30 })
    const state = projectedAnimator(bridge.inspect())
    // A 0.9 s cycle (idle 1 s and walk 0.8 s, half each): 30 steps are 0.5 s of it.
    expect(state).toEqual({
      loaded: true,
      current: 'Halves',
      time: match.closeTo(0.5, 6),
      playing: true,
      poseHash: match.stringMatching(/^[0-9a-f]{8}$/),
      weights: { idle: match.closeTo(0.5, 9), walk: match.closeTo(0.5, 9) },
      params: { speed: 0.5 },
    })
  })

})

describe('Animator weights while a fade runs and before the model settles (issue #205 CA-8)', () => {
  it('keeps the clips that fade out in weights, scaled by their share', async () => {
    const game = await rigGame([rigEntity('Walker', { blends: { Halves: HALVES } })])
    const bridge = runtimeBridgeOf(game)
    await game.assets.ready()
    const animator = defined(defined(game.find('Walker')).get(Animator))
    animator.setParam('speed', 0.5)
    animator.play('Halves')
    bridge.control({ operation: 'step', frames: 10 })
    animator.play('jump')

    bridge.control({ operation: 'step', frames: 3 })
    // Three steps into a 0.15 s fade: the blend keeps 2/3, half of it each clip.
    expect(projectedAnimator(bridge.inspect())).toMatchObject({
      current: 'jump',
      weights: { idle: match.closeTo(1 / 3, 9), walk: match.closeTo(1 / 3, 9), jump: match.closeTo(1 / 3, 9) },
    })
  })

  it('reports empty weights before the model settles, and params the blends read at 0', async () => {
    const game = await rigGame([rigEntity('Walker', { initialClip: 'walk', blends: { Halves: HALVES } })])
    const bridge = runtimeBridgeOf(game)

    expect(projectedAnimator(bridge.inspect())).toMatchObject({ loaded: false, weights: {}, params: { speed: 0 } })
  })
})
