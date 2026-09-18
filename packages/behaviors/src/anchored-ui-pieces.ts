import { HEALTH_UI } from './health-ui.js'
import { INTERACTABLE_UI, INTERACTABLE_UI_PIECE } from './interactable.js'

/**
 * The names of the stock Anchored Pieces (issue #72, ADR 0018): every piece
 * these behaviors ship except npc-line, the screen-space fallback. Their
 * `{{bindings}}` are per-instance values, not Game stats, so tooling such as
 * validate_project reads this list to tell them apart.
 */
export const ANCHORED_UI_PIECES: readonly string[] = Object.freeze([
  ...Object.keys(INTERACTABLE_UI).filter((name) => name !== INTERACTABLE_UI_PIECE),
  ...Object.keys(HEALTH_UI),
])
