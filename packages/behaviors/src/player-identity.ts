import { StateMachine, type Entity } from '@waica/engine'

/** Player identity is the role contract, independent of the movement driver. */
export function isPlayer(entity: Entity): boolean {
  return entity.get(StateMachine)?.role === 'player'
}
