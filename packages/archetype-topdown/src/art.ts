import type { ArchetypeArt } from '@waica/engine'

/**
 * The archetype's stock art, as pure data (no asset imports: node tooling
 * like scripts/sync-scene.mjs imports this module directly).
 *
 * Demo projects materialize each sheet as a real file at `src/art/<file>`
 * and reference that path; `uri` is the registry key that in-package
 * prefab defaults use.
 */
export const TOPDOWN_ART: ArchetypeArt[] = [
  { file: 'waica-hero.png', uri: 'waica:hero', kind: 'image' },
  { file: 'waica-npc.png', uri: 'waica:npc', kind: 'image' },
  { file: 'waica-blob.png', uri: 'waica:blob', kind: 'image' },
  { file: 'waica-potion.png', uri: 'waica:potion', kind: 'image' },
  { file: 'waica-grass.png', uri: 'waica:grass', kind: 'image' },
  { file: 'waica-path.png', uri: 'waica:path', kind: 'image' },
  { file: 'waica-water.png', uri: 'waica:water', kind: 'image' },
  { file: 'waica-fence.png', uri: 'waica:fence', kind: 'image' },
  { file: 'waica-tree.png', uri: 'waica:tree', kind: 'image' },
]
