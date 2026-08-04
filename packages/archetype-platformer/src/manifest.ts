import type { ArchetypeManifest } from '@waica/engine'
import { PLATFORMER_ART } from './art.js'
import { PLATFORMER_BUNDLE } from './bundle.js'
import { PLATFORMER_ACTION_LABELS, PLATFORMER_BINDINGS } from './controls.js'
import { PLATFORMER_PREFABS } from './prefabs.js'
import { PLATFORMER_PALETTE, PLATFORMER_REGISTRY_DATA } from './registry-data.js'
import { PLATFORMER_BLANK_SCENE, PLATFORMER_SCENE } from './scene-default.js'

const PLATFORMER_ENTITY_ICONS: Readonly<Record<string, string>> = {
  PlatformerMotor: '🐕',
  Collectible: '🪙',
  Hazard: '👾',
}

/** Pure-data manifest for Node tooling; its module graph contains no assets. */
export const ARCHETYPE = {
  id: 'platformer',
  label: 'Platformer',
  scene: PLATFORMER_SCENE,
  blankScene: PLATFORMER_BLANK_SCENE,
  registry: PLATFORMER_REGISTRY_DATA,
  palette: PLATFORMER_PALETTE,
  prefabs: PLATFORMER_PREFABS,
  art: PLATFORMER_ART,
  entityIcons: PLATFORMER_ENTITY_ICONS,
  bindings: PLATFORMER_BINDINGS,
  actionLabels: PLATFORMER_ACTION_LABELS,
  bundle: PLATFORMER_BUNDLE,
} satisfies ArchetypeManifest
