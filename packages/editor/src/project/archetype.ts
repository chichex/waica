import { ARCHETYPE } from '@waica/archetype-platformer'
import { ARCHETYPE as TOPDOWN_ARCHETYPE } from '@waica/archetype-topdown'
import { ARCHETYPE as ISOMETRIC_ARCHETYPE } from '@waica/archetype-isometric'
import type { BrowserArchetypeManifest } from '@waica/engine'
import { createContext, useContext } from 'react'

export type ArchetypeManifest = BrowserArchetypeManifest

export const DEFAULT_ARCHETYPE_ID = 'platformer'

/** npm package that ships an archetype, by repo convention. */
export function archetypePackageName(id: string): string {
  return `@waica/archetype-${id}`
}

const ARCHETYPES: Readonly<Record<string, ArchetypeManifest>> = {
  platformer: ARCHETYPE,
  topdown: TOPDOWN_ARCHETYPE,
  isometric: ISOMETRIC_ARCHETYPE,
}

/**
 * Resolves project identity at runtime. An absent id stays platformer-safe
 * (legacy projects); a present-but-unknown id is an explicit error — opening
 * such a project as platformer would silently misread it.
 */
export function resolveArchetype(id?: string | null): ArchetypeManifest {
  const key = id ?? DEFAULT_ARCHETYPE_ID
  if (!Object.hasOwn(ARCHETYPES, key)) {
    throw new Error(
      `Unknown archetype "${key}". This project declares an archetype this editor ` +
        `does not know — check the "archetype" field in src/game.json or update waica.`,
    )
  }
  return ARCHETYPES[key] as ArchetypeManifest
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
      blurb: 'Zelda-style overhead view: 8-direction movement with depth-sorted drawing.',
      status: 'ready',
    },
    {
      id: 'isometric',
      icon: '💎',
      label: 'Isometric',
      blurb: '8-direction movement with automatic animation mirroring.',
      status: 'ready',
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
