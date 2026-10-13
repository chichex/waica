import { Component, StateMachine, type Entity } from '@waica/engine'
import { Chaser, isPlayer, Patrol } from '@waica/behaviors'

/**
 * The demo's goal (issue #181 inference 18): when the player overlaps this
 * entity's sensor it shows the `piece` screen-space piece ("You win") once and
 * pauses every living `enemy`: back in patrol (so one winding up never
 * strikes), their Chaser no longer sees anyone and their Patrol stands, so the
 * courtyard goes quiet.
 */
export class GoalChest extends Component {
  static override componentName = 'GoalChest'
  static override displayName = 'Goal chest'
  static override params = {
    piece: { label: 'Win piece', ref: 'ui' as const },
  }
  static override transient = ['reached']

  /** The screen-space piece shown on reaching the chest. */
  piece = 'you-win'
  /** True once the player reached it. */
  reached = false

  override onCollide(other: Entity): void {
    if (this.reached || !isPlayer(other)) return
    this.reached = true
    if (this.piece) this.game.ui.show(this.piece, { scope: 'scene' })
    for (const entity of this.game.entities) pauseEnemy(entity)
  }
}

/** Quiets one living `enemy`: back to patrol, seeing no one, standing still. Anything else is left alone. */
function pauseEnemy(entity: Entity): void {
  const fsm = entity.get(StateMachine)
  if (fsm?.role !== 'enemy') return
  if (fsm.current !== 'die' && fsm.states.patrol) fsm.goto('patrol')
  const chaser = entity.get(Chaser)
  if (chaser) chaser.range = 0
  const patrol = entity.get(Patrol)
  if (patrol) patrol.speed = 0
}
