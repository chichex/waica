import type { BrowserArchetypeManifest } from '@waica/engine'
import { ARCHETYPE as DATA_ARCHETYPE } from './manifest.js'
import { THIRD_PERSON_ART_URLS, THIRD_PERSON_REGISTRY } from './registry.js'

export { THIRD_PERSON_ART } from './art.js'
export { THIRD_PERSON_BUNDLE } from './bundle.js'
export { THIRD_PERSON_ACTION_LABELS, THIRD_PERSON_BINDINGS } from './controls.js'
export { ControlsHint } from './controls-hint.js'
export { GoalChest } from './goal-chest.js'
export { HeartsHud } from './hearts-hud.js'
export { HitShake } from './hit-shake.js'
export { KNIGHT_CLIPS, SKELETON_CLIPS, THIRD_PERSON_PREFABS } from './prefabs.js'
export { THIRD_PERSON_ART_URLS, THIRD_PERSON_PALETTE, THIRD_PERSON_REGISTRY } from './registry.js'
export { THIRD_PERSON_BLANK_SCENE, THIRD_PERSON_SCENE } from './scene-default.js'
export { THIRD_PERSON_UI } from './ui.js'

export const ARCHETYPE = {
  ...DATA_ARCHETYPE,
  registry: THIRD_PERSON_REGISTRY,
  artUrls: THIRD_PERSON_ART_URLS,
} satisfies BrowserArchetypeManifest
