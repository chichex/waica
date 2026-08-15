import type { BrowserArchetypeManifest } from '@waica/engine'
import { ARCHETYPE as DATA_ARCHETYPE } from './manifest.js'
import { TOPDOWN_REGISTRY, TOPDOWN_ART_URLS } from './registry.js'

export { TOPDOWN_ANIMATION } from './animation.js'
export { TOPDOWN_BUNDLE } from './bundle.js'
export { TOPDOWN_ACTION_LABELS, TOPDOWN_BINDINGS } from './controls.js'
export { TOPDOWN_SCENE, TOPDOWN_BLANK_SCENE, HERO_SPRITE } from './scene-default.js'
export { TOPDOWN_PREFABS } from './prefabs.js'
export { TOPDOWN_UI } from './ui.js'
export { TOPDOWN_ART } from './art.js'
export { TOPDOWN_REGISTRY, TOPDOWN_PALETTE, TOPDOWN_ART_URLS } from './registry.js'

/** Browser-complete manifest exported by the package root. */
export const ARCHETYPE = {
  ...DATA_ARCHETYPE,
  registry: TOPDOWN_REGISTRY,
  artUrls: TOPDOWN_ART_URLS,
} satisfies BrowserArchetypeManifest
