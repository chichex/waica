import {
  AnimatedSprite,
  Collider,
  Hitbox,
  Light,
  Model,
  PointLight,
  ParticleEmitter,
  RigidBody,
  Solid,
  Sprite,
  StateMachine,
  Sun,
  Tilemap,
  type EntityTemplate,
  type SceneRegistry,
} from '@waica/engine'
import {
  CharacterMotor,
  Chaser,
  ClickToMove,
  Collectible,
  DamagePuff,
  Hazard,
  Health,
  Interactable,
  IsoMotor,
  Lifetime,
  MeleeAttack,
  Patrol,
  Respawnable,
  SceneTransition,
  SwingSparks,
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
    ParticleEmitter,
    Light,
    Model,
    Sun,
    PointLight,
    Collider,
    RigidBody,
    CharacterMotor,
    Tilemap,
    Solid,
    Hitbox,
    StateMachine,
    IsoMotor,
    MeleeAttack,
    SwingSparks,
    DamagePuff,
    Interactable,
    Collectible,
    Patrol,
    Chaser,
    Hazard,
    Health,
    Respawnable,
    Lifetime,
    ClickToMove,
    SceneTransition,
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
  wind: '🌬️',
  'hurt-smoke': '💨',
  'cave-dust': '✨',
  torch: '🔥',
  wall: '🧱',
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
