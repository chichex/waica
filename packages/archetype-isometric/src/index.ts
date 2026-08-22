import type { BrowserArchetypeManifest } from '@waica/engine'
import { ARCHETYPE as DATA_ARCHETYPE } from './manifest.js'
import { ISOMETRIC_ART_URLS, ISOMETRIC_REGISTRY } from './registry.js'

export { ISOMETRIC_ANIMATION } from './animation.js'
export { ISOMETRIC_ART } from './art.js'
export { ISOMETRIC_BUNDLE } from './bundle.js'
export { ISOMETRIC_ACTION_LABELS, ISOMETRIC_BINDINGS } from './controls.js'
export { ISOMETRIC_PREFABS, ISOMETRIC_HERO_SPRITE } from './prefabs.js'
export {
  ISOMETRIC_ART_URLS,
  ISOMETRIC_PALETTE,
  ISOMETRIC_REGISTRY,
} from './registry.js'
export { ISOMETRIC_BLANK_SCENE, ISOMETRIC_SCENE } from './scene-default.js'
export { ISOMETRIC_UI } from './ui.js'

export const ARCHETYPE = {
  ...DATA_ARCHETYPE,
  registry: ISOMETRIC_REGISTRY,
  artUrls: ISOMETRIC_ART_URLS,
} satisfies BrowserArchetypeManifest
