import {
  AnimatedSprite,
  DynamicBody,
  Hitbox,
  Solid,
  Sprite,
  StateMachine,
  type EntityTemplate,
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
import { PLATFORMER_ART } from './art.js'
import { PLATFORMER_PREFABS } from './prefabs.js'
import { PLATFORMER_UI } from './ui.js'

const PACKAGE_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  PLATFORMER_ART.map((art) => [art.uri, `assets/${art.file}`]),
)

/** Asset-import-free registry. Browser URL resolution is layered on separately. */
export const PLATFORMER_REGISTRY_DATA: SceneRegistry = {
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
  resolveAsset: (uri) => PACKAGE_ASSETS[uri] ?? uri,
  prefabs: PLATFORMER_PREFABS,
  ui: PLATFORMER_UI,
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
