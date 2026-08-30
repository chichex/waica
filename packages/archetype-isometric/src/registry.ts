import type { SceneRegistry } from '@waica/engine'
import { ISOMETRIC_ART } from './art.js'
import { ISOMETRIC_REGISTRY_DATA } from './registry-data.js'

export { ISOMETRIC_PALETTE } from './registry-data.js'

export const ISOMETRIC_ART_URLS: Record<string, string> = {
  'waica-iso-hero.png': new URL('../assets/waica-iso-hero.png', import.meta.url).href,
  'waica-iso-villager.png': new URL('../assets/waica-iso-villager.png', import.meta.url).href,
  'waica-iso-orc.png': new URL('../assets/waica-iso-orc.png', import.meta.url).href,
  'waica-iso-ground.png': new URL('../assets/waica-iso-ground.png', import.meta.url).href,
  'waica-iso-tree.png': new URL('../assets/waica-iso-tree.png', import.meta.url).href,
  'waica-iso-rock.png': new URL('../assets/waica-iso-rock.png', import.meta.url).href,
  'waica-iso-crate.png': new URL('../assets/waica-iso-crate.png', import.meta.url).href,
  'waica-iso-click-marker.png': new URL('../assets/waica-iso-click-marker.png', import.meta.url).href,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  ISOMETRIC_ART.map((art) => [art.uri, ISOMETRIC_ART_URLS[art.file] ?? art.uri]),
)

export const ISOMETRIC_REGISTRY: SceneRegistry = {
  ...ISOMETRIC_REGISTRY_DATA,
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}
