import type { ArchetypeArt } from '@waica/engine'

/** Stock art as Node-safe package data: KayKit's CC0 Knight, Skeleton Warrior and Dungeon Remastered pieces (assets/ATTRIBUTION.md). */
export const THIRD_PERSON_ART: ArchetypeArt[] = [
  { file: 'knight.glb', uri: 'waica:tp-knight', kind: 'model' },
  { file: 'skeleton-warrior.glb', uri: 'waica:tp-skeleton-warrior', kind: 'model' },
  { file: 'dungeon-wall.glb', uri: 'waica:tp-wall', kind: 'model' },
  { file: 'dungeon-floor.glb', uri: 'waica:tp-floor', kind: 'model' },
  { file: 'dungeon-foundation.glb', uri: 'waica:tp-foundation', kind: 'model' },
  { file: 'dungeon-pillar.glb', uri: 'waica:tp-pillar', kind: 'model' },
  { file: 'dungeon-torch.glb', uri: 'waica:tp-torch', kind: 'model' },
  { file: 'dungeon-chest.glb', uri: 'waica:tp-chest', kind: 'model' },
  { file: 'dungeon-banner.glb', uri: 'waica:tp-banner', kind: 'model' },
]
