import type { StateJson } from '@waica/engine'
import { PLATFORMER_STATE_GRAPH } from './platformer-states'
import { PATROLLER_STATE_GRAPH } from './patrol'

/**
 * The component each built-in logic set drives. The logic's states read
 * these (`entity.get(PlatformerMotor)`) and early-return without them, so
 * a character carrying the logic but not its driver just stands there.
 * The editor uses this to warn and point at the fix.
 */
export const LOGIC_DRIVERS: Record<string, string> = {
  platformer: 'PlatformerMotor',
  patroller: 'Patrol',
}

/**
 * The starter state graph of each built-in logic set — what the editor
 * offers to install when a character switches to that logic.
 */
export const LOGIC_STATE_GRAPHS: Record<
  string,
  { initial: string; states: Record<string, StateJson> }
> = {
  platformer: PLATFORMER_STATE_GRAPH,
  patroller: PATROLLER_STATE_GRAPH,
}
