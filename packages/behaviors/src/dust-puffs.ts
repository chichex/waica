import { Component, ParticleEmitter, StateMachine } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor.js'

/** The stock player graph's grounded states: a jump entered from one of these is a takeoff. */
const GROUND_STATES = ['idle', 'run']
/** The airborne states a landing can end: a grounded exit from either is a touchdown. */
const AIR_STATES = ['jump', 'fall']

/**
 * Dust from this entity's own ParticleEmitter at the
 * two moments a platformer body meets the ground hard — a small puff when a
 * jump takes off from the ground, a bigger burst when the body lands. Both
 * come from the same emitter (the dust look is authored on it in the
 * prefab); only the count differs. It hooks the StateMachine's own edges
 * instead of polling:
 *
 * - takeoff: entering 'jump' right after leaving 'idle' or 'run'. The graph
 *   also enters 'jump' from 'fall' in mid-air (a coyote jump, a stomp
 *   bounce); those raise no dust.
 * - landing: leaving 'jump' or 'fall' while the motor is grounded. A jump
 *   whose apex already lands on a ledge goes jump -> idle without a fall.
 *
 * Its siblings must already be mounted when it is, so it goes after the
 * StateMachine and the ParticleEmitter in the prefab.
 */
export class DustPuffs extends Component {
  static override componentName = 'DustPuffs'
  static override displayName = 'Dust puffs'
  static override params = {
    jumpCount: { label: 'Jump puff', min: 0, max: 64, step: 1 },
    landCount: { label: 'Landing burst', min: 0, max: 64, step: 1 },
  }
  static override transient = ['leftGround']

  /** Particles when a jump takes off from the ground. */
  jumpCount = 5
  /** Particles when the body lands. */
  landCount = 12

  /** Whether the state just left was a grounded one: set on every exit, read on entering 'jump'. */
  private leftGround = false

  override onReady(): void {
    const machine = this.entity.get(StateMachine)
    const dust = this.entity.get(ParticleEmitter)
    if (!machine || !dust) {
      console.warn(
        `[waica] "${this.entity.name}": DustPuffs needs a StateMachine and a ParticleEmitter before it.`,
      )
      return
    }
    for (const state of GROUND_STATES) {
      machine.on(state, { onExit: () => (this.leftGround = true) })
    }
    for (const state of AIR_STATES) {
      machine.on(state, {
        onExit: () => {
          this.leftGround = false
          if (this.entity.get(PlatformerMotor)?.grounded) dust.emit(this.landCount)
        },
      })
    }
    machine.on('jump', {
      onEnter: () => {
        if (this.leftGround) dust.emit(this.jumpCount)
      },
    })
  }
}
