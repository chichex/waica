import type { SceneRegistry } from '@waica/engine'
import { PLATFORMER_ART } from './art.js'
import { PLATFORMER_REGISTRY_DATA } from './registry-data.js'
import dogSheet from '../assets/waica-dog.png'
import coinSheet from '../assets/waica-coin.png'
import slimeSheet from '../assets/waica-slime.png'

export { PLATFORMER_PALETTE } from './registry-data.js'

/** Bundled URL per stock art file (kept out of the Node-safe manifest). */
export const PLATFORMER_ART_URLS: Record<string, string> = {
  'waica-dog.png': dogSheet,
  'waica-coin.png': coinSheet,
  'waica-slime.png': slimeSheet,
}

const BUILTIN_ASSETS: Record<string, string> = Object.fromEntries(
  PLATFORMER_ART.map((art) => [art.uri, PLATFORMER_ART_URLS[art.file] ?? art.uri]),
)

/** Browser registry with bundled asset resolution layered over the pure data. */
export const PLATFORMER_REGISTRY: SceneRegistry = {
  ...PLATFORMER_REGISTRY_DATA,
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}
