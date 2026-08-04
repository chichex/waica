import type { ArchetypeArt } from '@waica/engine'

/**
 * The archetype's stock art, as pure data (no asset imports: node tooling
 * like scripts/sync-scene.mjs imports this module directly).
 *
 * Demo projects materialize each sheet as a real file at `src/art/<file>`
 * and reference that path; `uri` is the legacy registry key that in-package
 * prefab defaults (and old projects) still use.
 */
export const PLATFORMER_ART: ArchetypeArt[] = [
  { file: 'waica-dog.png', uri: 'waica:dog' },
  { file: 'waica-coin.png', uri: 'waica:coin' },
  { file: 'waica-slime.png', uri: 'waica:slime' },
]
