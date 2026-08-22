import { createGridPlayerRole } from './grid-player-role.js'
import { TopDownMotor } from './topdown-motor.js'

/**
 * The top-down player role: eight-direction logical-grid movement with
 * normalized diagonals and no gravity, driven by TopDownMotor.
 */
const topdownPlayer = createGridPlayerRole(
  TopDownMotor,
  'You control this character with the project controls: eight-direction ' +
    'top-down movement with normalized diagonals and no gravity. Its ' +
    'states move the Motor.',
)

/** The state graph new top-down player characters start with, as prefab data. */
export const TOPDOWN_PLAYER_STATE_GRAPH = topdownPlayer.graph

/** Drives TopDownMotor from project actions and reports body state. */
export const topdownPlayerUpdate = topdownPlayer.update

export const TOPDOWN_PLAYER_ROLE = topdownPlayer.role
