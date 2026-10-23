// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: the Game under test builds its renderer through it.
vi.mock(
  new URL('../../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.ts')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, GltfModelBackend, loadScene, type Game } from '@waica/engine'
import { ready3dGame, use3dTestEnvironment } from '../../../engine/src/test-game-3d.ts'
import { serveRig, step } from '../../../engine/src/test-rig.ts'
import { defined, match } from '../../../engine/src/test-support.ts'
import { blendedCharacters } from './blended-characters.ts'

// Issue #205 CA-25: the scene blendedCharacters plans really mixes the rig's clips.

use3dTestEnvironment()
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The plan for `n` characters over the real rig, its perStep run from the Game's host updates as the bench harness runs it. */
async function plannedGame(n: number): Promise<Game> {
  serveRig()
  const plan = blendedCharacters(n)
  const { game } = await ready3dGame(undefined, undefined, { models: new GltfModelBackend() })
  let count = 0
  game.onUpdate(() => plan.perStep?.(game, ++count))
  loadScene(game, plan.scene, plan.registry)
  await game.assets.ready()
  return game
}

const weightsOf = (game: Game, index: number): Record<string, number> => defined(defined(game.find(`Character-${index}`)).get(Animator)).inspectState().weights

it('mixes idle and walk, walk alone, and walk and jump in turn once its speeds arrived (issue #205 CA-25)', async () => {
  const game = await plannedGame(3)
  // The speeds arrive in step 1's host update, after the Animators ran: step 2 is the first to mix them.
  step(game, 2)

  expect([0, 1, 2].map((index) => weightsOf(game, index))).toEqual([
    { idle: match.closeTo(0.5, 9), walk: match.closeTo(0.5, 9) },
    { walk: 1 },
    { walk: match.closeTo(0.5, 9), jump: match.closeTo(0.5, 9) },
  ])
})
