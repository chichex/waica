import {
  type Component,
  type ComponentClass,
  type RoleDefinition,
  type RoleGraph,
  type StateContext,
} from '@waica/engine'
import { Health } from './health.js'
import { interactUpdate } from './interactable.js'
import { Respawnable } from './respawnable.js'

interface PlayerMotor extends Component {
  walkThreshold: number
  run(inputX: number, inputY: number, dt: number): void
  step(dt: number): void
  speed(): number
}

interface GridPlayerRoleParts {
  graph: RoleGraph
  update(ctx: StateContext, dt: number): void
  role: RoleDefinition
}

/** Builds the common player graph and role around one genre-specific grid motor. */
export function createGridPlayerRole<T extends PlayerMotor>(
  Motor: ComponentClass<T>,
  description: string,
): GridPlayerRoleParts {
  const graph: RoleGraph = {
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
        transitions: [{ on: 'timer:0.8', to: 'idle' }],
      },
      // Dying is the same from every state, so the edge lives on '*'. Its
      // presence is also the contract Health checks before signalling: a graph
      // without it gets its entity destroyed instead.
      '*': { transitions: [{ on: 'signal:death', to: 'dead' }] },
    },
  }

  const update = ({ entity, game, fsm }: StateContext, dt: number): void => {
    const motor = entity.get(Motor)
    if (!motor) return
    motor.run(game.input.axis('left', 'right'), game.input.axis('down', 'up'), dt)
    motor.step(dt)
    fsm.signal(motor.speed() > motor.walkThreshold ? 'move' : 'stop')
  }

  const role: RoleDefinition = {
    description,
    driver: Motor.componentName,
    graph,
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
      // Fallback: a custom state without its own onUpdate keeps the full body
      // update — its file only has to say what makes it special.
      default: { onUpdate: update },
      idle: { onUpdate: update },
      walk: { onUpdate: update },
      // Coming back is what leaving death means, so it hangs off onExit: any
      // other way out of this state (a project's own edge) revives too.
      dead: {
        // A state without its own onUpdate falls back to the role's default
        // body update, so this no-op keeps the player still for the death beat.
        onUpdate() {},
        onExit({ entity }) {
          entity.get(Respawnable)?.respawn()
          entity.get(Health)?.heal(Infinity)
        },
      },
    },
  }

  return { graph, update, role }
}
