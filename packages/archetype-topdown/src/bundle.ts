import type { ArchetypeBundle } from '@waica/engine'
import {
  CHASER_ROLE,
  NPC_ROLE,
  PATROLLER_ROLE,
  TOPDOWN_PLAYER_ROLE,
} from '@waica/behaviors'

/** Role and state-code baseline installed for a top-down project. */
export const TOPDOWN_BUNDLE: ArchetypeBundle = {
  roles: {
    player: TOPDOWN_PLAYER_ROLE,
    patroller: PATROLLER_ROLE,
    chaser: CHASER_ROLE,
    npc: NPC_ROLE,
  },
}
