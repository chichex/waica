// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { AnimatorState } from './components/animator.js'
import type { RuntimeSnapshot } from './runtime-inspection.js'
import { runtimeBridgeOf, use3dTestEnvironment } from './test-game-3d.js'
import { rigEntity, rigGame } from './test-rig.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The Animator's state of the one rig entity in a snapshot, as inspect_runtime projects it. */
function animatorStateOf(snapshot: RuntimeSnapshot): AnimatorState {
  const entity = defined(snapshot.entities.find((candidate) => candidate.name === 'Walker'))
  const component = defined(entity.components.find((candidate) => candidate.type === 'Animator'))
  return component.state as AnimatorState
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
