import {
  Animator,
  Collider,
  Model,
  PointLight,
  RigidBody,
  StateMachine,
  Sun,
  type EntityTemplate,
  type SceneRegistry,
} from '@waica/engine'
import { CharacterMotor, Chaser, Checkpoint, Health, MeleeAttack, Patrol, Respawnable } from '@waica/behaviors'
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
    Patrol,
    Chaser,
    Checkpoint,
    GoalChest,
    HeartsHud,
    ControlsHint,
    HitShake,
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
