import { type RoleDefinition, type RoleGraph, type StateContext } from '@waica/engine'
import { Health } from './health.js'
import { PlatformerMotor } from './platformer-motor.js'
import { Respawnable } from './respawnable.js'

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
    dead: {
      // The stock dog sheet has no death animation; freeze on idle rather
      // than name a clip that does not exist and warn every frame.
      clip: 'idle',
      // A beat before control comes back, so death reads as an event.
      transitions: [{ on: 'timer:0.8', to: 'idle' }],
    },
    // Dying is the same from every state, so the edge lives on '*'. Its
    // presence is also the contract Health checks before signalling: a graph
    // without it gets its entity destroyed instead.
    '*': { transitions: [{ on: 'signal:death', to: 'dead' }] },
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

export const PLAYER_ROLE: RoleDefinition = {
  description:
    'You control this character with the project controls: run and jump ' +
    'with platformer physics and curated game feel (coyote time, jump ' +
    'buffering). Its states move the Motor.',
  driver: 'PlatformerMotor',
  graph: PLAYER_STATE_GRAPH,
  signals: {
    move: 'on the ground and moving',
    stop: 'on the ground and standing still',
    rise: 'airborne, going up',
    fall: 'airborne, going down',
    land: 'just touched the ground',
  },
  states: {
    // Always-hook: motor bookkeeping (coyote/buffer timers, squash, facing)
    // must survive custom states like a dash, so it runs in every state.
    '*': {
      onUpdate({ entity }, dt) {
        entity.get(PlatformerMotor)?.tick(dt)
      },
    },
    // Fallback: a custom state without its own onUpdate keeps the full
    // body update — its file only has to say what makes it special.
    default: { onUpdate: playerUpdate },
    idle: { onUpdate: playerUpdate },
    run: { onUpdate: playerUpdate },
    jump: { onUpdate: playerUpdate },
    fall: { onUpdate: playerUpdate },
    // Coming back is what leaving death means, so it hangs off onExit: any
    // other way out of this state (a project's own edge) revives too.
    dead: {
      onExit({ entity }) {
        entity.get(Respawnable)?.respawn()
        entity.get(Health)?.heal(Infinity)
      },
    },
  },
}
