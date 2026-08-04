import type { SceneRegistry } from '@waica/engine'
import { PLATFORMER_ART } from './art.js'
import { PLATFORMER_REGISTRY_DATA } from './registry-data.js'

export { PLATFORMER_PALETTE } from './registry-data.js'

/** Browser URL per stock-art file; Node resolves these to packed file URLs. */
export const PLATFORMER_ART_URLS: Record<string, string> = {
  'waica-dog.png': new URL('../assets/waica-dog.png', import.meta.url).href,
  'waica-coin.png': new URL('../assets/waica-coin.png', import.meta.url).href,
  'waica-slime.png': new URL('../assets/waica-slime.png', import.meta.url).href,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  PLATFORMER_ART.map((art) => [art.uri, PLATFORMER_ART_URLS[art.file] ?? art.uri]),
)

/** Browser registry with bundled asset resolution layered over the shared registry. */
export const PLATFORMER_REGISTRY: SceneRegistry = {
  ...PLATFORMER_REGISTRY_DATA,
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}
