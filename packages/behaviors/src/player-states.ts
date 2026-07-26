import { defineRole, type RoleGraph, type StateContext } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor'

/**
 * The 'player' role: the character you control. All four default states
 * share one body update; they differ only in the edges their prefab data
 * declares. Extending the player is defineStates('player', { yourState:
 * {...} }) plus a state in the prefab — never a fight with a parallel
 * controller.
 */

/** The state graph new player characters start with, as prefab data. */
export const PLAYER_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [
        { on: 'signal:move', to: 'run' },
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:fall', to: 'fall' },
      ],
    },
    run: {
      transitions: [
        { on: 'signal:stop', to: 'idle' },
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:fall', to: 'fall' },
      ],
    },
    jump: {
      transitions: [
        { on: 'signal:fall', to: 'fall' },
        { on: 'signal:land', to: 'idle' },
      ],
    },
    fall: {
      // 'rise' from here is the coyote jump (and hazard stomp bounces).
      transitions: [
        { on: 'signal:rise', to: 'jump' },
        { on: 'signal:land', to: 'idle' },
      ],
    },
  },
}

/**
 * One body update shared by every default state: move, jump, gravity,
 * collide, then report what the body is doing as signals. Unmatched
 * signals are no-ops, so each state only reacts to the edges its data
 * declares.
 */
export function playerUpdate({ entity, game, fsm }: StateContext, dt: number): void {
  const motor = entity.get(PlatformerMotor)
  if (!motor) return
  motor.runTowards(game.input.axis(), dt)
  if (motor.wantsJump()) motor.jump()
  motor.applyGravity(dt)
  motor.step(dt)
  if (motor.grounded) {
    fsm.signal('land')
    fsm.signal(Math.abs(motor.vx) > motor.runThreshold ? 'move' : 'stop')
  } else {
    fsm.signal(motor.vy > 0 ? 'rise' : 'fall')
  }
}

defineRole('player', {
  description:
    'You control this character with the project controls: run and jump ' +
    'with platformer physics and curated game feel (coyote time, jump ' +
    'buffering). Its states move the Motor.',
  driver: 'PlatformerMotor',
  graph: PLAYER_STATE_GRAPH,
  states: {
    // Always-hook: motor bookkeeping (coyote/buffer timers, squash, facing)
    // must survive custom states like a dash, so it runs in every state.
    '*': {
      onUpdate({ entity }, dt) {
        entity.get(PlatformerMotor)?.tick(dt)
      },
    },
    idle: { onUpdate: playerUpdate },
    run: { onUpdate: playerUpdate },
    jump: { onUpdate: playerUpdate },
    fall: { onUpdate: playerUpdate },
  },
})
