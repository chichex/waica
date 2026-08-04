import { ARCHETYPE } from '@waica/archetype-platformer'
import type { ArchetypeManifest } from '@waica/engine'
import { createContext, useContext } from 'react'

export type { ArchetypeManifest } from '@waica/engine'

export const DEFAULT_ARCHETYPE_ID = 'platformer'

const ARCHETYPES: Readonly<Record<string, ArchetypeManifest>> = {
  platformer: ARCHETYPE,
}

/** Resolves project identity at runtime; legacy/unknown ids stay platformer-safe. */
export function resolveArchetype(id?: string | null): ArchetypeManifest {
  return ARCHETYPES[id ?? DEFAULT_ARCHETYPE_ID] ?? ARCHETYPE
}

/** Runtime manifest inherited by editor panels under the open project. */
export const ArchetypeContext = createContext<ArchetypeManifest>(ARCHETYPE)

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
