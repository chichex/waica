// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { use3dTestEnvironment } from '../test-game-3d.js'
import { rigEntity, rigGame, step } from '../test-rig.js'
import { defined } from '../test-support.js'
import { Animator } from './animator.js'

// Issue #181 CA-15: how far the playing clip is, so a state can act part-way through it (the attack's strike).

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reports 0 before any clip, then the playing clip’s time over its duration, held at 1 once a one-shot ends (CA-15)', async () => {
  const game = await rigGame([rigEntity('Rig', { clips: { jump: { loop: false } } })])
  await game.assets.ready()
  const animator = defined(defined(game.find('Rig')).get(Animator))
  expect(animator.clipProgress).toBe(0)

  animator.play('jump')
  step(game, 12)
  expect(animator.clipProgress).toBeCloseTo(12 / 30, 6)
  step(game, 30)
  expect(animator.clipProgress).toBe(1)
})
