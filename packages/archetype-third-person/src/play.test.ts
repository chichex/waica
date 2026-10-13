// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Chaser, Health } from '@waica/behaviors'
import { installArchetype, loadScene, type Game, type RuntimeBridge, type SceneJson } from '@waica/engine'
import { ready3dGame, runtimeBridgeOf, use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { THIRD_PERSON_BUNDLE } from './bundle'
import { THIRD_PERSON_BINDINGS } from './controls'
import { THIRD_PERSON_REGISTRY_DATA } from './registry-data'
import { THIRD_PERSON_BLANK_SCENE, THIRD_PERSON_SCENE } from './scene-default'

// Issue #181 CA-26 (the goal) and CA-27 (the HUD), on a headless Game.

use3dTestEnvironment()
beforeEach(() => installArchetype(THIRD_PERSON_BUNDLE))

async function play(scene: SceneJson): Promise<{ game: Game; bridge: RuntimeBridge }> {
  const { game } = await ready3dGame(undefined, undefined, { bindings: THIRD_PERSON_BINDINGS })
  const bridge = runtimeBridgeOf(game)
  loadScene(game, scene, THIRD_PERSON_REGISTRY_DATA)
  await game.assets.ready()
  bridge.control({ operation: 'step', frames: 10 })
  return { game, bridge }
}

const hearts = (game: Game): string[] =>
  [...defined(game.ui.element('player-health')).querySelectorAll('.heart')].map((heart) => heart.className.replace('heart ', ''))

it('shows the player’s Health as hearts, two points each, and follows a hit (CA-27)', async () => {
  const { game, bridge } = await play(THIRD_PERSON_BLANK_SCENE)
  expect(game.ui.isVisible('player-health')).toBe(true)
  expect(hearts(game)).toEqual(['full', 'full', 'full'])

  defined(defined(game.find('Player')).get(Health)).damage(1)
  bridge.control({ operation: 'step' })

  expect(hearts(game)).toEqual(['full', 'full', 'half'])
})

it('shows the controls hint until the first press of any bound Action (CA-27)', async () => {
  const { game, bridge } = await play(THIRD_PERSON_BLANK_SCENE)
  expect(game.ui.isVisible('controls-hint')).toBe(true)
  bridge.control({ operation: 'step', frames: 30 })
  expect(game.ui.isVisible('controls-hint')).toBe(true)

  bridge.control({ operation: 'press', action: 'dodge' })
  bridge.control({ operation: 'step' })

  expect(game.ui.isVisible('controls-hint')).toBe(false)
})

it('shakes the camera when the Player takes a hit (G-23)', async () => {
  const { game, bridge } = await play(THIRD_PERSON_BLANK_SCENE)
  defined(defined(game.find('Player')).get(Health)).damage(1)
  bridge.control({ operation: 'step' })

  expect(game.cameraEffects.state.shake).not.toEqual({ x: 0, y: 0 })
})

it('shows "You win" and quiets the skeletons once the Player enters the goal chest’s sensor (CA-26)', async () => {
  const { game, bridge } = await play(THIRD_PERSON_SCENE)
  expect(game.ui.isVisible('you-win')).toBe(false)

  defined(game.find('Player')).position.set(6, 0.6, -6)
  bridge.control({ operation: 'step', frames: 3 })

  expect(game.ui.isVisible('you-win')).toBe(true)
  expect(defined(game.ui.element('you-win')).textContent).toContain('You win')
  const skeletons = game.entities.filter((entity) => entity.name.startsWith('Skeleton'))
  expect(skeletons).toHaveLength(3)
  for (const skeleton of skeletons) expect(defined(skeleton.get(Chaser)).range).toBe(0)
})
