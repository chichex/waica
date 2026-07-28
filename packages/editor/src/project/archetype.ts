import { createContext, useContext } from 'react'
import type {
  ArchetypeBundle,
  PrefabJson,
  SceneJson,
  SceneRegistry,
} from '@waica/engine'
import {
  PLATFORMER_ART,
  PLATFORMER_ART_URLS,
  PLATFORMER_BLANK_SCENE,
  PLATFORMER_BUNDLE,
  PLATFORMER_PALETTE,
  PLATFORMER_PREFABS,
  PLATFORMER_REGISTRY,
  PLATFORMER_SCENE,
  type ArchetypeArt,
  type EntityTemplate,
} from '@waica/archetype-platformer'

export const DEFAULT_ARCHETYPE_ID = 'platformer'

/** Everything the editor resolves from a project's persisted archetype id. */
export interface ArchetypeManifest {
  id: string
  label: string
  scene: SceneJson
  blankScene: SceneJson
  registry: SceneRegistry
  palette: EntityTemplate[]
  prefabs: Record<string, PrefabJson>
  art: ArchetypeArt[]
  artUrls: Record<string, string>
  entityIcons: Record<string, string>
  bundle: ArchetypeBundle
}

/** Icon per distinctive platformer component (for the hierarchy). */
const PLATFORMER_ENTITY_ICONS: Record<string, string> = {
  PlatformerMotor: '🐕',
  Collectible: '🪙',
  Hazard: '👾',
}

const PLATFORMER_ARCHETYPE: ArchetypeManifest = {
  id: 'platformer',
  label: 'Platformer',
  scene: PLATFORMER_SCENE,
  blankScene: PLATFORMER_BLANK_SCENE,
  registry: PLATFORMER_REGISTRY,
  palette: PLATFORMER_PALETTE,
  prefabs: PLATFORMER_PREFABS,
  art: PLATFORMER_ART,
  artUrls: PLATFORMER_ART_URLS,
  entityIcons: PLATFORMER_ENTITY_ICONS,
  bundle: PLATFORMER_BUNDLE,
}

const ARCHETYPES: Readonly<Record<string, ArchetypeManifest>> = {
  platformer: PLATFORMER_ARCHETYPE,
}

/** Resolves project identity at runtime; legacy/unknown ids stay platformer-safe. */
export function resolveArchetype(id?: string | null): ArchetypeManifest {
  return ARCHETYPES[id ?? DEFAULT_ARCHETYPE_ID] ?? PLATFORMER_ARCHETYPE
}

/** Runtime manifest inherited by editor panels under the open project. */
export const ArchetypeContext = createContext<ArchetypeManifest>(PLATFORMER_ARCHETYPE)

export function useArchetype(): ArchetypeManifest {
  return useContext(ArchetypeContext)
}

export interface ArchetypeCard {
  id: string
  icon: string
  label: string
  blurb: string
  status: 'ready' | 'soon'
}

/** Catalog for the "Create project" picker (DESIGN §2: archetype = genre + camera). */
export const ARCHETYPE_CATALOG: Record<'2d' | '3d', ArchetypeCard[]> = {
  '2d': [
    {
      id: 'platformer',
      icon: '🐕',
      label: 'Platformer',
      blurb: 'Run and jump with curated game feel: coyote time, jump buffering, deadzone camera.',
      status: 'ready',
    },
    {
      id: 'topdown',
      icon: '🗺️',
      label: 'Top-down',
      blurb: 'Zelda-style overhead view: 4-direction movement, no gravity.',
      status: 'soon',
    },
    {
      id: 'isometric',
      icon: '💎',
      label: 'Isometric',
      blurb: '8-direction movement with automatic animation mirroring.',
      status: 'soon',
    },
    {
      id: 'flipscreen',
      icon: '🖼️',
      label: 'Flip screen',
      blurb: 'The camera cuts at the screen edge, NES Zelda or classic arcade style.',
      status: 'soon',
    },
  ],
  '3d': [
    {
      id: 'thirdperson',
      icon: '🎥',
      label: 'Third person',
      blurb: 'Orbit camera behind the character, camera-relative movement.',
      status: 'soon',
    },
    {
      id: 'firstperson',
      icon: '👁️',
      label: 'First person',
      blurb: 'The camera in your eyes: look with the mouse, move with WASD.',
      status: 'soon',
    },
  ],
}
