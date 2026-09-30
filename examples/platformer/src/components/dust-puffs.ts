import { Component, ParticleEmitter, StateMachine } from '@waica/engine'
import { PlatformerMotor } from '@waica/behaviors'

/**
 * Example project code: dust from this entity's own ParticleEmitter at the
 * two moments a platformer body meets the ground hard — a small puff when a
 * jump starts, a bigger burst when a fall ends on the ground. Both come
 * from the same emitter (the dust look is authored on it in the prefab);
 * only the count differs. It hooks the StateMachine's own edges instead of
 * polling: entering 'jump', and leaving 'fall' while the motor is grounded
 * (a fall that ends in a coyote jump or a death is not a landing).
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

  /** Particles when a jump starts. */
  jumpCount = 5
  /** Particles when a fall lands. */
  landCount = 12

  override onReady(): void {
    const machine = this.entity.get(StateMachine)
    const dust = this.entity.get(ParticleEmitter)
    if (!machine || !dust) {
      console.warn(
        `[waica] "${this.entity.name}": DustPuffs needs a StateMachine and a ParticleEmitter before it.`,
      )
      return
    }
    machine.on('jump', { onEnter: () => dust.emit(this.jumpCount) })
    machine.on('fall', {
      onExit: () => {
        if (this.entity.get(PlatformerMotor)?.grounded) dust.emit(this.landCount)
      },
    })
  }
}
