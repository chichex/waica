import {
  Game,
  loadScene,
  type BrowserArchetypeManifest,
  type Entity,
} from '@waica/engine'
import { ARCHETYPE as DATA_ARCHETYPE } from './manifest.js'
import { PLATFORMER_REGISTRY, PLATFORMER_ART_URLS } from './registry.js'
import { PLATFORMER_SCENE } from './scene-default.js'

export { PLATFORMER_BUNDLE } from './bundle.js'
export { PLATFORMER_ACTION_LABELS, PLATFORMER_BINDINGS } from './controls.js'
export { PLATFORMER_SCENE, PLATFORMER_BLANK_SCENE, DOG_SPRITE } from './scene-default.js'
export { PLATFORMER_PREFABS } from './prefabs.js'
export { PLATFORMER_UI } from './ui.js'
export { PLATFORMER_ART } from './art.js'
export { PLATFORMER_REGISTRY, PLATFORMER_PALETTE, PLATFORMER_ART_URLS } from './registry.js'

/** Browser-complete manifest exported by the package root. */
export const ARCHETYPE = {
  ...DATA_ARCHETYPE,
  registry: PLATFORMER_REGISTRY,
  artUrls: PLATFORMER_ART_URLS,
} satisfies BrowserArchetypeManifest

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
