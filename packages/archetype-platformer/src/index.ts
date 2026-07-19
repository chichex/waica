import { Game, loadScene, type Entity } from '@waica/engine'
import { PLATFORMER_SCENE } from './scene-default'
import { PLATFORMER_REGISTRY } from './registry'

export { PLATFORMER_SCENE, DOG_SPRITE } from './scene-default'
export { PLATFORMER_REGISTRY, PLATFORMER_PALETTE } from './registry'
export type { EntityTemplate } from './registry'

export interface PlatformerSetup {
  player: Entity
  /** Marcador de monedas recogidas, para HUD y tests. */
  score: { coins: number }
}

/** HUD mínimo de monedas, conectado al evento 'collect' del juego. */
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
 * Arma la escena base del arquetipo plataformero cargando la escena
 * default (los proyectos reales cargan su propio src/scenes/*.json).
 */
export function setupPlatformer(game: Game): PlatformerSetup {
  loadScene(game, PLATFORMER_SCENE, PLATFORMER_REGISTRY)
  const score = attachCoinHud(game)
  const player = game.find('Player')
  if (!player) throw new Error('la escena default no tiene Player')
  return { player, score }
}
