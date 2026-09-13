import { Component, SIMULATION_TIME_EPSILON } from '@waica/engine'

/** Destroys its entity after a configurable amount of simulated time. */
export class Lifetime extends Component {
  static override componentName = 'Lifetime'
  static override params = {
    seconds: { label: 'Seconds', min: 0.05, max: 60, step: 0.05 },
  }
  static override transient = ['elapsed']

  seconds = 1
  private elapsed = 0

  override onUpdate(dt: number): void {
    // The frame that destroys the entity still iterates a copy of its
    // components: stop counting instead of destroying twice.
    if (!this.entity.alive) return
    this.elapsed += dt
    // this.elapsed is a sum of SIMULATION_STEP-sized dts, which float error
    // can leave a hair under an exact multiple; the epsilon keeps a bare
    // `>=` from waiting one whole step too long to destroy.
    if (this.elapsed + SIMULATION_TIME_EPSILON >= this.seconds) this.entity.destroy()
  }
}
