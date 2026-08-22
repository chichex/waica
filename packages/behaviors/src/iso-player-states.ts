import { type RoleDefinition, type RoleGraph, type StateContext } from '@waica/engine'
import { Health } from './health.js'
import { interactUpdate } from './interactable.js'
import { IsoMotor } from './iso-motor.js'
import { Respawnable } from './respawnable.js'

/** The state graph new isometric player characters start with. */
export const ISO_PLAYER_STATE_GRAPH: RoleGraph = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [{ on: 'signal:move', to: 'walk' }],
    },
    walk: {
      transitions: [{ on: 'signal:stop', to: 'idle' }],
    },
    dead: {
      clip: 'idle',
      transitions: [{ on: 'timer:0.8', to: 'idle' }],
    },
    '*': { transitions: [{ on: 'signal:death', to: 'dead' }] },
  },
}

/** Drives IsoMotor from screen-relative actions and reports body state. */
export function isoPlayerUpdate({ entity, game, fsm }: StateContext, dt: number): void {
  const motor = entity.get(IsoMotor)
  if (!motor) return
  motor.run(game.input.axis('left', 'right'), game.input.axis('down', 'up'), dt)
  motor.step(dt)
  fsm.signal(motor.speed() > motor.walkThreshold ? 'move' : 'stop')
}

export const ISO_PLAYER_ROLE: RoleDefinition = {
  description:
    'You control this character with screen-relative eight-direction movement ' +
    'projected into an isometric logical world. Its states move the Motor.',
  driver: 'IsoMotor',
  graph: ISO_PLAYER_STATE_GRAPH,
  signals: {
    move: 'moving',
    stop: 'standing still',
  },
  states: {
    '*': {
      onUpdate(ctx) {
        interactUpdate(ctx)
      },
    },
    default: { onUpdate: isoPlayerUpdate },
    idle: { onUpdate: isoPlayerUpdate },
    walk: { onUpdate: isoPlayerUpdate },
    dead: {
      onUpdate() {},
      onExit({ entity }) {
        entity.get(Respawnable)?.respawn()
        entity.get(Health)?.heal(Infinity)
      },
    },
  },
}
