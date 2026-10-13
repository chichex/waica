import { Component } from '@waica/engine'

/**
 * Shakes the camera when its entity takes a hit (issue #181 G-23: hit
 * feedback on the perspective camera). Listens to Health's `damage` event for
 * its own entity only.
 */
export class HitShake extends Component {
  static override componentName = 'HitShake'
  static override displayName = 'Hit shake'
  static override params = {
    intensity: { label: 'Intensity', min: 0, max: 2, step: 0.05 },
    seconds: { label: 'Seconds', min: 0, max: 2, step: 0.05 },
  }
  static override transient = ['unsubscribe']

  /** The shake's starting offset, in the 2D world units Camera Effects use. */
  intensity = 0.3
  seconds = 0.25
  private unsubscribe: (() => void) | null = null

  override onReady(): void {
    this.unsubscribe = this.game.events.on('damage', (payload: unknown) => {
      if (typeof payload !== 'object' || payload === null || Reflect.get(payload, 'entity') !== this.entity) return
      this.game.cameraEffects.shake({ intensity: this.intensity, seconds: this.seconds })
    })
  }

  override onDestroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}
