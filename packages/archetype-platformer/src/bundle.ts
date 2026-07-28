import type { ArchetypeBundle } from '@waica/engine'
import {
  CHASER_ROLE,
  NPC_ROLE,
  PATROLLER_ROLE,
  PLAYER_ROLE,
} from '@waica/behaviors'

/** Role and state-code baseline installed for a platformer project. */
export const PLATFORMER_BUNDLE: ArchetypeBundle = {
  roles: {
    player: PLAYER_ROLE,
    patroller: PATROLLER_ROLE,
    chaser: CHASER_ROLE,
    npc: NPC_ROLE,
  },
}
