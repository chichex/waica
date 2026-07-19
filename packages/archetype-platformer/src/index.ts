import { Game, loadScene, type Entity } from '@waica/engine'
import { PLATFORMER_SCENE } from './scene-default'
import { PLATFORMER_REGISTRY } from './registry'

export { PLATFORMER_SCENE, DOG_SPRITE } from './scene-default'
export { PLATFORMER_PREFABS } from './prefabs'
export { PLATFORMER_REGISTRY, PLATFORMER_PALETTE } from './registry'
export type { EntityTemplate } from './registry'

export interface PlatformerSetup {
  player: Entity
  /** Collected-coin counter, for the HUD and tests. */
  score: { coins: number }
}

/**
 * Minimal coin HUD, wired to the game's 'collect' event. Kept for older
 * projects: new scenes ship a Hud entity (the 'ui/coin-counter' prefab)
 * that renders the counter instead.
 */
export function attachCoinHud(game: Game): { coins: number } {
  const score = { coins: 0 }
  const hud = document.createElement('div')
  hud.style.cssText =
    'position:fixed;top:12px;left:14px;z-index:9000;font:600 20px system-ui,sans-serif;' +
    'color:#ffd166;text-shadow:0 1px 3px #000a;user-select:none'
  hud.textContent = '🪙 0'
  document.body.append(hud)
  game.events.on('collect', (value) => {
    score.coins += typeof value === 'number' ? value : 1
    hud.textContent = `🪙 ${score.coins}`
  })
  return score
}

/**
 * Sets up the platformer archetype's base scene by loading the default
 * scene (real projects load their own src/scenes/*.json). The scene's Hud
 * entity renders the coin counter; the returned score just tracks it.
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
