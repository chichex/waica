import { createGridPlayerRole } from './grid-player-role.js'
import { IsoMotor } from './iso-motor.js'

const isoPlayer = createGridPlayerRole(
  IsoMotor,
  'You control this character with screen-relative eight-direction movement ' +
    'projected into an isometric logical world. Its states move the Motor.',
)

/** The state graph new isometric player characters start with, as prefab data. */
export const ISO_PLAYER_STATE_GRAPH = isoPlayer.graph

/** Drives IsoMotor from screen-relative actions and reports body state. */
export const isoPlayerUpdate = isoPlayer.update

export const ISO_PLAYER_ROLE = isoPlayer.role
