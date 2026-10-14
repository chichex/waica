import {
  AnimatedSprite,
  Animator,
  Collider,
  DynamicBody,
  Hitbox,
  Model,
  PointLight,
  RigidBody,
  Solid,
  Sprite,
  StateMachine,
  Sun,
  type EntityTemplate,
  type SceneRegistry,
} from '@waica/engine'
import { CharacterMotor, Chaser, Checkpoint, Health, MeleeAttack, OutOfBounds, Patrol, PlatformerMotor, Respawnable } from '@waica/behaviors'
import { THIRD_PERSON_ART } from './art.js'
import { ControlsHint } from './controls-hint.js'
import { GoalChest } from './goal-chest.js'
import { HeartsHud } from './hearts-hud.js'
import { HitShake } from './hit-shake.js'
import { THIRD_PERSON_PREFABS } from './prefabs.js'
import { THIRD_PERSON_UI } from './ui.js'

const PACKAGE_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  THIRD_PERSON_ART.map((art) => [art.uri, `assets/${art.file}`]),
)

export const THIRD_PERSON_REGISTRY_DATA: SceneRegistry = {
  components: {
    Model,
    Animator,
    Sun,
    PointLight,
    Collider,
    RigidBody,
    StateMachine,
    CharacterMotor,
    MeleeAttack,
    Health,
    Respawnable,
    // A fall off the level kills, and the death respawns the Player (the blank start is an open floor).
    OutOfBounds,
    Patrol,
    Chaser,
    Checkpoint,
    GoalChest,
    HeartsHud,
    ControlsHint,
    HitShake,
    // A subset of the 2D components, kept out of every scene and prefab (the conformance suite checks
    // it): the ones a 2D prefab is built from, the 2D motor, and DynamicBody, which OutOfBounds updates
    // after (an update target must be known). Known here so validate_project reports one in a 3D scene
    // as a component-space-mismatch, not an unknown component (issue #181 CA-35). Any other 2D
    // component (Tilemap, Light, Hazard, the other motors…) stays unknown here.
    Sprite,
    AnimatedSprite,
    Hitbox,
    Solid,
    PlatformerMotor,
    DynamicBody,
  },
  resolveAsset: (uri) => PACKAGE_ASSETS[uri] ?? uri,
  prefabs: THIRD_PERSON_PREFABS,
  ui: THIRD_PERSON_UI,
}

const PALETTE_ICONS: Record<string, string> = {
  player: '🛡️',
  skeleton: '💀',
  checkpoint: '🚩',
  'goal-chest': '🏆',
  wall: '🧱',
  floor: '⬛',
  step: '🪜',
  column: '🏛️',
  torch: '🔥',
}

export const THIRD_PERSON_PALETTE: EntityTemplate[] = Object.entries(THIRD_PERSON_PREFABS).map(([key, prefab]) => {
  const base = key.slice(key.indexOf('/') + 1)
  return {
    label: base,
    icon: PALETTE_ICONS[base] ?? '▣',
    category: prefab.type,
    make: () => ({ name: base.charAt(0).toUpperCase() + base.slice(1), prefab: key }),
  }
})
