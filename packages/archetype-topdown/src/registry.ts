import type { SceneRegistry } from '@waica/engine'
import { TOPDOWN_ART } from './art.js'
import { TOPDOWN_REGISTRY_DATA } from './registry-data.js'

export { TOPDOWN_PALETTE } from './registry-data.js'

/** Browser URL per stock-art file; Node resolves these to packed file URLs. */
export const TOPDOWN_ART_URLS: Record<string, string> = {
  'waica-hero.png': new URL('../assets/waica-hero.png', import.meta.url).href,
  'waica-npc.png': new URL('../assets/waica-npc.png', import.meta.url).href,
  'waica-blob.png': new URL('../assets/waica-blob.png', import.meta.url).href,
  'waica-potion.png': new URL('../assets/waica-potion.png', import.meta.url).href,
  'waica-grass.png': new URL('../assets/waica-grass.png', import.meta.url).href,
  'waica-path.png': new URL('../assets/waica-path.png', import.meta.url).href,
  'waica-water.png': new URL('../assets/waica-water.png', import.meta.url).href,
  'waica-fence.png': new URL('../assets/waica-fence.png', import.meta.url).href,
  'waica-tree.png': new URL('../assets/waica-tree.png', import.meta.url).href,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  TOPDOWN_ART.map((art) => [art.uri, TOPDOWN_ART_URLS[art.file] ?? art.uri]),
)

/** Browser registry with bundled asset resolution layered over the shared registry. */
export const TOPDOWN_REGISTRY: SceneRegistry = {
  ...TOPDOWN_REGISTRY_DATA,
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}
