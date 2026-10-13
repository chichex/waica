import type { ArchetypeManifest } from '@waica/engine'
import { THIRD_PERSON_ART } from './art.js'
import { THIRD_PERSON_BUNDLE } from './bundle.js'
import { THIRD_PERSON_ACTION_LABELS, THIRD_PERSON_BINDINGS } from './controls.js'
import { THIRD_PERSON_PREFABS } from './prefabs.js'
import { THIRD_PERSON_PALETTE, THIRD_PERSON_REGISTRY_DATA } from './registry-data.js'
import { THIRD_PERSON_BLANK_SCENE, THIRD_PERSON_SCENE } from './scene-default.js'

export const THIRD_PERSON_ENTITY_ICONS: Readonly<Record<string, string>> = {
  CharacterMotor: '🛡️',
  Chaser: '💀',
  MeleeAttack: '⚔️',
  Checkpoint: '🚩',
  GoalChest: '🏆',
  PointLight: '🔥',
}

/** Node-safe manifest data (issue #181 CA-23): no `new URL`, so the MCP and the CLI read it in plain Node. */
export const ARCHETYPE = {
  id: 'third-person',
  label: 'Third person',
  scene: THIRD_PERSON_SCENE,
  blankScene: THIRD_PERSON_BLANK_SCENE,
  registry: THIRD_PERSON_REGISTRY_DATA,
  palette: THIRD_PERSON_PALETTE,
  prefabs: THIRD_PERSON_PREFABS,
  art: THIRD_PERSON_ART,
  entityIcons: THIRD_PERSON_ENTITY_ICONS,
  bindings: THIRD_PERSON_BINDINGS,
  actionLabels: THIRD_PERSON_ACTION_LABELS,
  bundle: THIRD_PERSON_BUNDLE,
} satisfies ArchetypeManifest
