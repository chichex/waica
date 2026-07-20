// The single point where the editor wires itself to a concrete archetype.
// Once the generic archetype manifest exists (DESIGN H3), this module is
// the only thing that migrates; the rest of the editor consumes ACTIVE_ARCHETYPE.
import {
  PLATFORMER_PALETTE,
  PLATFORMER_PREFABS,
  PLATFORMER_REGISTRY,
  PLATFORMER_SCENE,
} from '@waica/archetype-platformer'

/** Icon per distinctive archetype component (for the hierarchy). */
const ENTITY_ICONS: Record<string, string> = {
  PlatformerMovement: '🐕',
  Collectible: '🪙',
  Hazard: '👾',
}

export const ACTIVE_ARCHETYPE = {
  id: 'platformer',
  label: 'Platformer',
  scene: PLATFORMER_SCENE,
  registry: PLATFORMER_REGISTRY,
  palette: PLATFORMER_PALETTE,
  prefabs: PLATFORMER_PREFABS,
  entityIcons: ENTITY_ICONS,
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
