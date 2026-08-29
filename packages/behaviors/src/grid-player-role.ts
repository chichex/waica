import {
  type Component,
  type ComponentClass,
  type RoleDefinition,
  type RoleGraph,
  type StateContext,
} from '@waica/engine'
import { logicalDirection } from './facing.js'
import { Health } from './health.js'
import { interactUpdate } from './interactable.js'
import { MeleeAttack } from './melee-attack.js'
import { Respawnable } from './respawnable.js'

interface PlayerMotor extends Component {
  walkThreshold: number
  knockbackSpeed: number
  facing: string
  vx: number
  vy: number
  run(inputX: number, inputY: number, dt: number): void
  step(dt: number): void
  speed(): number
  halt(): void
}

interface GridPlayerRoleParts {
  graph: RoleGraph
  update(ctx: StateContext, dt: number): void
  role: RoleDefinition
}

/** Seconds the attack swing and the hurt stun each keep the body from the player. */
const ATTACK_SECONDS = 0.3
const HURT_SECONDS = 0.3

/** Builds the common player graph and role around one genre-specific grid motor. */
export function createGridPlayerRole<T extends PlayerMotor>(
  Motor: ComponentClass<T>,
  description: string,
): GridPlayerRoleParts {
  const graph: RoleGraph = {
    initial: 'idle',
    states: {
      idle: {
        transitions: [
          { on: 'input:attack', to: 'attack' },
          { on: 'signal:move', to: 'walk' },
        ],
      },
      walk: {
        transitions: [
          { on: 'input:attack', to: 'attack' },
          { on: 'signal:stop', to: 'idle' },
        ],
      },
      // One swing, body frozen; the strike itself lands on entry.
      attack: {
        transitions: [{ on: `timer:${ATTACK_SECONDS}`, to: 'idle' }],
      },
      // Knocked back and stunned for a beat; the '*' edge below gets it here.
      hurt: {
        transitions: [{ on: `timer:${HURT_SECONDS}`, to: 'idle' }],
      },
      dead: {
        // The death pose, resolved directionally like every other clip.
        clip: 'death',
        transitions: [{ on: 'timer:0.8', to: 'idle' }],
      },
      // Dying and getting hurt are the same from every state, so both edges
      // live on '*' — death first, so a lethal hit never lands in hurt. The
      // death edge is also the contract Health checks before signalling: a
      // graph without it gets its entity destroyed instead.
      '*': {
        transitions: [
          { on: 'signal:death', to: 'dead' },
          { on: 'signal:hurt', to: 'hurt' },
        ],
      },
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
      attack: {
        onEnter({ entity }) {
          const motor = entity.get(Motor)
          if (!motor) return
          motor.halt()
          entity.get(MeleeAttack)?.strike(motor.facing)
        },
        // Explicit no-op: without it the state would inherit the default
        // body update and keep walking through the swing.
        onUpdate() {},
      },
      hurt: {
        onEnter({ entity, game }) {
          const motor = entity.get(Motor)
          if (!motor) return
          const source = entity.get(Health)?.lastDamageSource
          const dx = source ? entity.position.x - source.position.x : 0
          const dy = source ? entity.position.y - source.position.y : 0
          const distance = Math.hypot(dx, dy)
          let away = distance > 0 ? { x: dx / distance, y: dy / distance } : undefined
          if (!away) {
            // No source (or one standing on top of us): recoil from the facing.
            const forward = logicalDirection(motor.facing, game.projection)
            away = forward ? { x: -forward.x, y: -forward.y } : { x: 0, y: 0 }
          }
          motor.vx = away.x * motor.knockbackSpeed
          motor.vy = away.y * motor.knockbackSpeed
        },
        // The shove resolves against Solids like any movement; no input.
        onUpdate({ entity }, dt) {
          entity.get(Motor)?.step(dt)
        },
        onExit({ entity }) {
          entity.get(Motor)?.halt()
        },
      },
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
