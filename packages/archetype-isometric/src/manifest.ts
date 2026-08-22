import type { ArchetypeManifest } from '@waica/engine'
import { ISOMETRIC_ANIMATION } from './animation.js'
import { ISOMETRIC_ART } from './art.js'
import { ISOMETRIC_BUNDLE } from './bundle.js'
import { ISOMETRIC_ACTION_LABELS, ISOMETRIC_BINDINGS } from './controls.js'
import { ISOMETRIC_PREFABS } from './prefabs.js'
import { ISOMETRIC_PALETTE, ISOMETRIC_REGISTRY_DATA } from './registry-data.js'
import { ISOMETRIC_BLANK_SCENE, ISOMETRIC_SCENE } from './scene-default.js'

export const ISOMETRIC_ENTITY_ICONS: Readonly<Record<string, string>> = {
  IsoMotor: '🧭',
  Tilemap: '💎',
  Interactable: '💬',
  Collectible: '📦',
  Hazard: '👹',
}

export const ARCHETYPE = {
  id: 'isometric',
  label: 'Isometric',
  scene: ISOMETRIC_SCENE,
  blankScene: ISOMETRIC_BLANK_SCENE,
  registry: ISOMETRIC_REGISTRY_DATA,
  palette: ISOMETRIC_PALETTE,
  prefabs: ISOMETRIC_PREFABS,
  art: ISOMETRIC_ART,
  entityIcons: ISOMETRIC_ENTITY_ICONS,
  bindings: ISOMETRIC_BINDINGS,
  actionLabels: ISOMETRIC_ACTION_LABELS,
  bundle: ISOMETRIC_BUNDLE,
  animation: ISOMETRIC_ANIMATION,
} satisfies ArchetypeManifest
