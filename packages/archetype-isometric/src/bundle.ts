import type { ArchetypeBundle } from '@waica/engine'
import {
  CHASER_ROLE,
  ISO_PLAYER_ROLE,
  NPC_ROLE,
  PATROLLER_ROLE,
} from '@waica/behaviors'

export const ISOMETRIC_BUNDLE: ArchetypeBundle = {
  roles: {
    player: ISO_PLAYER_ROLE,
    patroller: PATROLLER_ROLE,
    chaser: CHASER_ROLE,
    npc: NPC_ROLE,
  },
}
