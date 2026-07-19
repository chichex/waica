import {
  AnimatedSprite,
  Hitbox,
  Solid,
  Sprite,
  type PrefabJson,
  type SceneEntityJson,
  type SceneRegistry,
} from '@waica/engine'
import {
  CameraFollow,
  Collectible,
  Hazard,
  HudCounter,
  Patrol,
  PlatformerAnimator,
  PlatformerMovement,
  Respawnable,
} from '@waica/behaviors'
import { PLATFORMER_PREFABS } from './prefabs'
import dogSheet from '../assets/waica-dog.png'
import coinSheet from '../assets/waica-coin.png'
import slimeSheet from '../assets/waica-slime.png'

const BUILTIN_ASSETS: Record<string, string> = {
  'waica:dog': dogSheet,
  'waica:coin': coinSheet,
  'waica:slime': slimeSheet,
}

/** Components, prefabs and assets available in the platformer archetype. */
export const PLATFORMER_REGISTRY: SceneRegistry = {
  components: {
    Sprite,
    AnimatedSprite,
    Solid,
    Hitbox,
    PlatformerMovement,
    PlatformerAnimator,
    CameraFollow,
    Collectible,
    Patrol,
    Hazard,
    Respawnable,
    HudCounter,
  },
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
  prefabs: PLATFORMER_PREFABS,
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
  'coin-counter': '🔢',
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
