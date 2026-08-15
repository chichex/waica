import {
  AnimatedSprite,
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
  Health,
  Interactable,
  Lifetime,
  Patrol,
  Respawnable,
  TopDownMotor,
} from '@waica/behaviors'
import { TOPDOWN_ART } from './art.js'
import { TOPDOWN_PREFABS } from './prefabs.js'
import { TOPDOWN_UI } from './ui.js'

const PACKAGE_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  TOPDOWN_ART.map((art) => [art.uri, `assets/${art.file}`]),
)

/**
 * Asset-import-free registry. Browser URL resolution is layered on
 * separately. No DynamicBody or OutOfBounds: gravity physics and kill
 * heights have no meaning seen from above.
 */
export const TOPDOWN_REGISTRY_DATA: SceneRegistry = {
  components: {
    Sprite,
    AnimatedSprite,
    Solid,
    Hitbox,
    StateMachine,
    TopDownMotor,
    Interactable,
    Collectible,
    Patrol,
    Chaser,
    Hazard,
    Health,
    Respawnable,
    Lifetime,
  },
  resolveAsset: (uri) => PACKAGE_ASSETS[uri] ?? uri,
  prefabs: TOPDOWN_PREFABS,
  ui: TOPDOWN_UI,
}

const PALETTE_ICONS: Record<string, string> = {
  player: '🧒',
  villager: '🧑‍🌾',
  blob: '👾',
  potion: '🧪',
  meadow: '▩',
  grass: '🌿',
  path: '🟫',
  water: '🌊',
  fence: '🚧',
  tree: '🌳',
}

/** The editor palette: pieces you can drag into the viewport, one per prefab. */
export const TOPDOWN_PALETTE: EntityTemplate[] = Object.entries(TOPDOWN_PREFABS).map(
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
