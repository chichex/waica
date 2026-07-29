import {
  AnimatedSprite,
  DynamicBody,
  Hitbox,
  Solid,
  Sprite,
  StateMachine,
  type PrefabJson,
  type SceneEntityJson,
  type SceneRegistry,
} from '@waica/engine'
import {
  Chaser,
  Collectible,
  Hazard,
  Lifetime,
  Patrol,
  PlatformerMotor,
  Respawnable,
} from '@waica/behaviors'
import { PLATFORMER_PREFABS } from './prefabs'
import { PLATFORMER_UI } from './ui'
import { PLATFORMER_ART } from './art'
import dogSheet from '../assets/waica-dog.png'
import coinSheet from '../assets/waica-coin.png'
import slimeSheet from '../assets/waica-slime.png'

/** Bundled URL per stock art file (kept out of art.ts: node can't import PNGs). */
export const PLATFORMER_ART_URLS: Record<string, string> = {
  'waica-dog.png': dogSheet,
  'waica-coin.png': coinSheet,
  'waica-slime.png': slimeSheet,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  PLATFORMER_ART.map((art) => [art.uri, PLATFORMER_ART_URLS[art.file] ?? art.uri]),
)

/** Components, prefabs and assets available in the platformer archetype. */
export const PLATFORMER_REGISTRY: SceneRegistry = {
  components: {
    Sprite,
    AnimatedSprite,
    Solid,
    Hitbox,
    DynamicBody,
    StateMachine,
    PlatformerMotor,
    Collectible,
    Patrol,
    Chaser,
    Hazard,
    Respawnable,
    Lifetime,
  },
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
  prefabs: PLATFORMER_PREFABS,
  ui: PLATFORMER_UI,
}

export interface EntityTemplate {
  label: string
  icon: string
  category: PrefabJson['type']
  /** Builds the JSON for a new instance (no position; the editor sets it). */
  make: () => SceneEntityJson
}

const PALETTE_ICONS: Record<string, string> = {
  player: '🐕',
  slime: '👾',
  coin: '🪙',
  platform: '▬',
  block: '■',
  decor: '▢',
}

/** The editor palette: pieces you can drag into the viewport, one per prefab. */
export const PLATFORMER_PALETTE: EntityTemplate[] = Object.entries(PLATFORMER_PREFABS).map(
  ([key, prefab]) => {
    const base = key.slice(key.indexOf('/') + 1)
    return {
      label: base,
      icon: PALETTE_ICONS[base] ?? '▣',
      category: prefab.type,
      make: () => ({ name: base.charAt(0).toUpperCase() + base.slice(1), prefab: key }),
    }
  },
)
