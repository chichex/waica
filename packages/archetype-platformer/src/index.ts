import { Game, loadScene, type Entity } from '@waica/engine'
import { PLATFORMER_SCENE } from './scene-default'
import { PLATFORMER_REGISTRY } from './registry'

export { PLATFORMER_SCENE, DOG_SPRITE } from './scene-default'
export { PLATFORMER_PREFABS } from './prefabs'
export { PLATFORMER_UI } from './ui'
export { PLATFORMER_REGISTRY, PLATFORMER_PALETTE } from './registry'
export type { EntityTemplate } from './registry'

export interface PlatformerSetup {
  player: Entity
  /** Collected-coin counter, for the HUD and tests. */
  score: { coins: number }
}

/**
 * Sets up the platformer archetype's base scene by loading the default
 * scene (real projects load their own src/scenes/*.json). The scene's
 * 'coin-counter' UI piece renders the counter; the returned score just
 * tracks it.
 */
export function setupPlatformer(game: Game): PlatformerSetup {
  loadScene(game, PLATFORMER_SCENE, PLATFORMER_REGISTRY)
  const score = { coins: 0 }
  game.events.on('collect', (value) => {
    score.coins += typeof value === 'number' ? value : 1
  })
  const player = game.find('Player')
  if (!player) throw new Error('default scene has no Player')
  return { player, score }
}
