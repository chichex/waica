import { Component } from '@waica/engine'

/** Destroys its entity after a configurable amount of simulated time. */
export class Lifetime extends Component {
  static override componentName = 'Lifetime'
  static override params = {
    seconds: { label: 'Seconds', min: 0.05, max: 60, step: 0.05 },
  }

  seconds = 1
  private elapsed = 0

  override onUpdate(dt: number): void {
    this.elapsed += dt
    if (this.elapsed >= this.seconds) this.entity.destroy()
  }
}
