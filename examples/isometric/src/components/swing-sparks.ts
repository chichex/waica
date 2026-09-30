import { Component, ParticleEmitter, StateMachine } from '@waica/engine'

/**
 * Example project code: a burst of sparks from this entity's own
 * ParticleEmitter each time its StateMachine enters the swing state. The
 * look (color, speed, lifetime) is authored on the emitter in the prefab;
 * this only decides when, and how many. It hooks the state's onEnter
 * instead of polling, so it fires exactly once per swing — right after
 * the role's own onEnter has landed the strike.
 *
 * Its siblings must already be mounted when it is, so it goes after the
 * StateMachine and the ParticleEmitter in the prefab.
 */
export class SwingSparks extends Component {
  static override componentName = 'SwingSparks'
  static override displayName = 'Swing sparks'
  static override params = {
    state: { label: 'State' },
    count: { label: 'Sparks', min: 1, max: 64, step: 1 },
  }

  /** The state whose entry is a swing. */
  state = 'attack'
  /** Sparks per swing. */
  count = 14

  override onReady(): void {
    const machine = this.entity.get(StateMachine)
    const sparks = this.entity.get(ParticleEmitter)
    if (!machine || !sparks) {
      console.warn(
        `[waica] "${this.entity.name}": SwingSparks needs a StateMachine and a ParticleEmitter before it.`,
      )
      return
    }
    machine.on(this.state, { onEnter: () => sparks.emit(this.count) })
  }
}
