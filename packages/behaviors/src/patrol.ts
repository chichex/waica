import {
  Component,
  installedDirectionalAnimation,
  projectIsometric,
  type AnimationFacingProvider,
  type RoleDefinition,
  type RoleGraph,
} from '@waica/engine'
import { facingForInput } from './facing.js'

export type PatrolAxis = 'horizontal' | 'vertical'

/** Seconds a hit stops the rail. */
const HURT_SECONDS = 0.25
/** Seconds the death pose stays on screen before the entity goes away. */
const DEATH_SECONDS = 0.5

/**
 * Rail patrol: back and forth `distance` units from the starting
 * position along one axis — sideways or up and down — turning around
 * at the ends. It reports which way it walks as seen on screen, so a
 * directional contract picks the matching clip; without one, walking
 * sideways flips the sprite by scale instead.
 * Passive like a motor: no onUpdate of its own — the 'patroller' logic
 * set's walk state calls step(dt), so the StateMachine stays the single
 * owner of the frame.
 */
export class Patrol extends Component implements AnimationFacingProvider {
  static override componentName = 'Patrol'
  static override params = {
    axis: { label: 'Axis', options: ['horizontal', 'vertical'] },
    distance: { label: 'Distance', min: 0.5, max: 20, step: 0.5 },
    speed: { label: 'Speed', min: 0.5, max: 15, step: 0.5 },
  }
  static override transient = ['originX', 'originY', 'dir']

  axis: PatrolAxis = 'horizontal'
  distance = 3
  speed = 2

  // Both origins are captured so a live axis switch keeps a valid rail.
  private originX = 0
  private originY = 0
  private dir = 1

  override onReady(): void {
    this.originX = this.entity.position.x
    this.originY = this.entity.position.y
  }

  /**
   * The rail direction as rendered: the logical axis it walks along,
   * projected when the scene is isometric — a horizontal rail reads as
   * south-east/north-west there, a vertical one as south-west/north-east.
   */
  getAnimationFacing(): string {
    const vertical = this.axis === 'vertical'
    const lx = vertical ? 0 : this.dir
    const ly = vertical ? this.dir : 0
    const screen = this.game.projection === 'isometric' ? projectIsometric(lx, ly) : { x: lx, y: ly }
    return facingForInput(Math.sign(screen.x), Math.sign(screen.y)) ?? 's'
  }

  /** One patrol step: advance, turn at the rail's ends, flip the sprite. */
  step(dt: number): void {
    const pos = this.entity.position
    const vertical = this.axis === 'vertical'
    const key = vertical ? 'y' : 'x'
    const origin = vertical ? this.originY : this.originX
    let next = pos[key] + this.dir * this.speed * dt
    if (next > origin + this.distance) {
      next = origin + this.distance
      this.dir = -1
    } else if (next < origin - this.distance) {
      next = origin - this.distance
      this.dir = 1
    }
    pos[key] = next
    // With a directional contract installed the clip carries the mirroring
    // (flipX); a scale flip on top would undo it.
    if (!vertical && !installedDirectionalAnimation()) this.entity.scale.x = this.dir
  }
}

/** The state graph new patrolling characters start with, as prefab data. */
export const PATROLLER_STATE_GRAPH: RoleGraph = {
  initial: 'walk',
  states: {
    walk: {},
    hurt: { transitions: [{ on: `timer:${HURT_SECONDS}`, to: 'walk' }] },
    // The death pose, resolved directionally like every other clip.
    dead: { clip: 'death' },
    // Death first: a lethal hit must never land in hurt. The death edge is
    // also what makes Health hand the death to this graph instead of
    // destroying the entity on the spot.
    '*': {
      transitions: [
        { on: 'signal:death', to: 'dead' },
        { on: 'signal:hurt', to: 'hurt' },
      ],
    },
  },
}

// The walking-critter role. Walks, flinches, dies; give patrolling
// characters more states by registering on top (defineStates('patroller',
// { chasing: {...} })) plus prefab data.
export const PATROLLER_ROLE: RoleDefinition = {
  description:
    'Walks back and forth on its own along a rail — no player input, no ' +
    'gravity. Good for critters and moving hazards. Its states move Patrol.',
  driver: 'Patrol',
  graph: PATROLLER_STATE_GRAPH,
  states: {
    walk: {
      onUpdate({ entity }, dt) {
        entity.get(Patrol)?.step(dt)
      },
    },
    // The rail stops for the flinch: no step, nothing else to do.
    hurt: { onUpdate() {} },
    // Holds the death pose for a beat, then the body goes away for good.
    dead: {
      onUpdate({ entity, fsm }) {
        if (fsm.elapsed >= DEATH_SECONDS) entity.destroy()
      },
    },
  },
}
