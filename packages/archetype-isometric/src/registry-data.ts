import {
  AnimatedSprite,
  Hitbox,
  Solid,
  Sprite,
  StateMachine,
  Tilemap,
  type EntityTemplate,
  type SceneRegistry,
} from '@waica/engine'
import {
  Chaser,
  ClickToMove,
  Collectible,
  Hazard,
  Health,
  Interactable,
  IsoMotor,
  Lifetime,
  MeleeAttack,
  Patrol,
  Respawnable,
} from '@waica/behaviors'
import { ISOMETRIC_ART } from './art.js'
import { ISOMETRIC_PREFABS } from './prefabs.js'
import { ISOMETRIC_UI } from './ui.js'

const PACKAGE_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  ISOMETRIC_ART.map((art) => [art.uri, `assets/${art.file}`]),
)

export const ISOMETRIC_REGISTRY_DATA: SceneRegistry = {
  components: {
    Sprite,
    AnimatedSprite,
    Tilemap,
    Solid,
    Hitbox,
    StateMachine,
    IsoMotor,
    MeleeAttack,
    Interactable,
    Collectible,
    Patrol,
    Chaser,
    Hazard,
    Health,
    Respawnable,
    Lifetime,
    ClickToMove,
  },
  resolveAsset: (uri) => PACKAGE_ASSETS[uri] ?? uri,
  prefabs: ISOMETRIC_PREFABS,
  ui: ISOMETRIC_UI,
}

const PALETTE_ICONS: Record<string, string> = {
  player: '🧭',
  villager: '🧑‍🌾',
  orc: '👹',
  crate: '📦',
  tree: '🌳',
  rock: '🪨',
  ground: '💎',
}

export const ISOMETRIC_PALETTE: EntityTemplate[] = Object.entries(ISOMETRIC_PREFABS).map(
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
