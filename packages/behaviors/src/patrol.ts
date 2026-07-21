import { Component, defineStates } from '@waica/engine'

/**
 * Horizontal rail patrol: back and forth `distance` units from the
 * starting position, turning around at the ends (with a sprite flip).
 * Passive like a motor: no onUpdate of its own — the 'patroller' logic
 * set's walk state calls step(dt), so the StateMachine stays the single
 * owner of the frame.
 */
export class Patrol extends Component {
  static override componentName = 'Patrol'
  static override params = {
    distance: { label: 'Distance', min: 0.5, max: 20, step: 0.5 },
    speed: { label: 'Speed', min: 0.5, max: 15, step: 0.5 },
  }

  distance = 3
  speed = 2

  private originX = 0
  private dir = 1

  override onReady(): void {
    this.originX = this.entity.position.x
  }

  /** One patrol step: advance, turn at the rail's ends, flip the sprite. */
  step(dt: number): void {
    const pos = this.entity.position
    pos.x += this.dir * this.speed * dt
    if (pos.x > this.originX + this.distance) {
      pos.x = this.originX + this.distance
      this.dir = -1
    } else if (pos.x < this.originX - this.distance) {
      pos.x = this.originX - this.distance
      this.dir = 1
    }
    this.entity.scale.x = this.dir
  }
}

// The 'patroller' logic set: the walking-critter brain. One state out of
// the box; give patrolling characters more states by registering on top
// (defineStates('patroller', { chasing: {...} })) plus prefab data.
defineStates('patroller', {
  walk: {
    onUpdate({ entity }, dt) {
      entity.get(Patrol)?.step(dt)
    },
  },
})
