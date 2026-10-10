import { Component, ParticleEmitter, StateMachine, type ComponentSpace } from '@waica/engine'

/**
 * A soft dust trail while this entity walks. The
 * ParticleEmitter on the same entity does the continuous emission (its
 * `rate` and dust look are authored in the prefab, with `emitting: false`);
 * this only switches `emitting` on when the StateMachine enters the walking
 * state and off when it leaves it, so the trail stops the moment the body
 * does and the dust already raised settles on its own.
 *
 * Its siblings must already be mounted when it is, so it goes after the
 * StateMachine and the ParticleEmitter in the prefab.
 */
export class DustTrail extends Component {
  static override componentName = 'DustTrail'
  static override space: ComponentSpace = '2d'
  static override displayName = 'Dust trail'
  static override params = {
    state: { label: 'State' },
  }

  /** The state during which the trail is raised. */
  state = 'walk'

  override onReady(): void {
    const machine = this.entity.get(StateMachine)
    const dust = this.entity.get(ParticleEmitter)
    if (!machine || !dust) {
      console.warn(
        `[waica] "${this.entity.name}": DustTrail needs a StateMachine and a ParticleEmitter before it.`,
      )
      return
    }
    dust.emitting = machine.current === this.state
    machine.on(this.state, {
      onEnter: () => {
        dust.emitting = true
      },
      onExit: () => {
        dust.emitting = false
      },
    })
  }
}
