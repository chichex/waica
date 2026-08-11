import type { ArchetypeManifest } from '@waica/engine'
import { TOPDOWN_ANIMATION } from './animation.js'
import { TOPDOWN_ART } from './art.js'
import { TOPDOWN_BUNDLE } from './bundle.js'
import { TOPDOWN_ACTION_LABELS, TOPDOWN_BINDINGS } from './controls.js'
import { TOPDOWN_PREFABS } from './prefabs.js'
import { TOPDOWN_PALETTE, TOPDOWN_REGISTRY_DATA } from './registry-data.js'
import { TOPDOWN_BLANK_SCENE, TOPDOWN_SCENE } from './scene-default.js'

const TOPDOWN_ENTITY_ICONS: Readonly<Record<string, string>> = {
  TopDownMotor: '🧒',
  Interactable: '💬',
  Collectible: '🧪',
  Hazard: '👾',
}

/** Asset-import-free manifest for Node tooling. */
export const ARCHETYPE = {
  id: 'topdown',
  label: 'Top-down',
  scene: TOPDOWN_SCENE,
  blankScene: TOPDOWN_BLANK_SCENE,
  registry: TOPDOWN_REGISTRY_DATA,
  palette: TOPDOWN_PALETTE,
  prefabs: TOPDOWN_PREFABS,
  art: TOPDOWN_ART,
  entityIcons: TOPDOWN_ENTITY_ICONS,
  bindings: TOPDOWN_BINDINGS,
  actionLabels: TOPDOWN_ACTION_LABELS,
  bundle: TOPDOWN_BUNDLE,
  animation: TOPDOWN_ANIMATION,
} satisfies ArchetypeManifest
