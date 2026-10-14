import type { ArchetypeBundle } from '@waica/engine'
import { CHARACTER_ROLE, ENEMY_ROLE } from '@waica/behaviors'

/** The player is the 3D `character`, under the `player` name Chaser looks for; skeletons are `enemy`. */
export const THIRD_PERSON_BUNDLE: ArchetypeBundle = {
  roles: {
    player: CHARACTER_ROLE,
    enemy: ENEMY_ROLE,
  },
}
