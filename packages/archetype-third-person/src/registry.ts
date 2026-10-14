import type { SceneRegistry } from '@waica/engine'
import { THIRD_PERSON_ART } from './art.js'
import { THIRD_PERSON_REGISTRY_DATA } from './registry-data.js'

export { THIRD_PERSON_PALETTE } from './registry-data.js'

export const THIRD_PERSON_ART_URLS: Record<string, string> = {
  'knight.glb': new URL('../assets/knight.glb', import.meta.url).href,
  'skeleton-warrior.glb': new URL('../assets/skeleton-warrior.glb', import.meta.url).href,
  'dungeon-wall.glb': new URL('../assets/dungeon-wall.glb', import.meta.url).href,
  'dungeon-floor.glb': new URL('../assets/dungeon-floor.glb', import.meta.url).href,
  'dungeon-foundation.glb': new URL('../assets/dungeon-foundation.glb', import.meta.url).href,
  'dungeon-pillar.glb': new URL('../assets/dungeon-pillar.glb', import.meta.url).href,
  'dungeon-torch.glb': new URL('../assets/dungeon-torch.glb', import.meta.url).href,
  'dungeon-chest.glb': new URL('../assets/dungeon-chest.glb', import.meta.url).href,
  'dungeon-banner.glb': new URL('../assets/dungeon-banner.glb', import.meta.url).href,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  THIRD_PERSON_ART.map((art) => [art.uri, THIRD_PERSON_ART_URLS[art.file] ?? art.uri]),
)

export const THIRD_PERSON_REGISTRY: SceneRegistry = {
  ...THIRD_PERSON_REGISTRY_DATA,
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}
