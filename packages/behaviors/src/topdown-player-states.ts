import { type RoleDefinition, type RoleGraph, type StateContext } from '@waica/engine'
import { Health } from './health.js'
import { interactUpdate } from './interactable.js'
import { Respawnable } from './respawnable.js'
import { TopDownMotor } from './topdown-motor.js'

/**
 * The top-down 'player' role: the character you control from above. Both
 * default states share one body update; they differ only in the edges
 * their prefab data declares. Extending the player is defineStates
 * ('player', { yourState: {...} }) plus a state in the prefab — never a
 * fight with a parallel controller.
 */

/** The state graph new top-down player characters start with, as prefab data. */
export const TOPDOWN_PLAYER_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [{ on: 'signal:move', to: 'walk' }],
    },
    walk: {
      transitions: [{ on: 'signal:stop', to: 'idle' }],
    },
    dead: {
      // Freeze on idle (resolved directionally) rather than name a death
      // clip the stock sheets do not have and warn every frame.
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
 * One body update shared by every default state: read the four-direction
 * actions, accelerate, collide, then report what the body is doing as
 * signals. Unmatched signals are no-ops, so each state only reacts to
 * the edges its data declares.
 */
export function topdownPlayerUpdate({ entity, game, fsm }: StateContext, dt: number): void {
  const motor = entity.get(TopDownMotor)
  if (!motor) return
  motor.run(game.input.axis('left', 'right'), game.input.axis('down', 'up'), dt)
  motor.step(dt)
  fsm.signal(motor.speed() > motor.walkThreshold ? 'move' : 'stop')
}

export const TOPDOWN_PLAYER_ROLE: RoleDefinition = {
  description:
    'You control this character with the project controls: eight-direction ' +
    'top-down movement with normalized diagonals and no gravity. Its ' +
    'states move the Motor.',
  driver: 'TopDownMotor',
  graph: TOPDOWN_PLAYER_STATE_GRAPH,
  signals: {
    move: 'moving',
    stop: 'standing still',
  },
  states: {
    // Always-hook: the interact lookup must survive custom states like an
    // attack, so it runs in every state.
    '*': {
      onUpdate(ctx) {
        interactUpdate(ctx)
      },
    },
    // Fallback: a custom state without its own onUpdate keeps the full
    // body update — its file only has to say what makes it special.
    default: { onUpdate: topdownPlayerUpdate },
    idle: { onUpdate: topdownPlayerUpdate },
    walk: { onUpdate: topdownPlayerUpdate },
    // Coming back is what leaving death means, so it hangs off onExit: any
    // other way out of this state (a project's own edge) revives too.
    dead: {
      // A state without its own onUpdate falls back to the role's default
      // body update, so without this no-op the player kept walking for the
      // whole death beat instead of the graph taking control away.
      onUpdate() {},
      onExit({ entity }) {
        entity.get(Respawnable)?.respawn()
        entity.get(Health)?.heal(Infinity)
      },
    },
  },
}
