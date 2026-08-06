import { Component, type RoleDefinition, type RoleGraph } from '@waica/engine'

export type PatrolAxis = 'horizontal' | 'vertical'

/**
 * Rail patrol: back and forth `distance` units from the starting
 * position along one axis — sideways or up and down — turning around
 * at the ends (with a sprite flip when walking sideways).
 * Passive like a motor: no onUpdate of its own — the 'patroller' logic
 * set's walk state calls step(dt), so the StateMachine stays the single
 * owner of the frame.
 */
export class Patrol extends Component {
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
    if (!vertical) this.entity.scale.x = this.dir
  }
}

/** The state graph new patrolling characters start with, as prefab data. */
export const PATROLLER_STATE_GRAPH: RoleGraph = {
  initial: 'walk',
  states: { walk: {} },
}

// The walking-critter role. One state out of the box; give patrolling
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
  },
}
