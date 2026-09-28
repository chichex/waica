import { Component, type CameraEffectColor, type Entity } from '@waica/engine'
import { Interactable } from './interactable.js'

/**
 * Replaces the live scene with `scene` (its file's stem, e.g.
 * "cave.scene.json" -> "cave") when fired — a door, or any entity a player
 * crosses or interacts with to leave the current map. Names only its
 * destination: the incoming scene places its own Player wherever that
 * scene authored it (no named entry points).
 *
 * With trigger:'overlap' (the default) it fires whenever its Hitbox mask
 * dispatches an overlap. Shipped doors target the `player` layer; this handler
 * deliberately does not recheck identity. With trigger:'interact' it implements
 * no radius or prompt of its own:
 * it needs a sibling Interactable and fires from the shared nearest-wins
 * interact scan (interactable.ts's fireInteract), so a door and an NPC in
 * range arbitrate themselves with no new rule.
 *
 * With fadeSeconds > 0 it hides the swap behind a Fade (issue #74): the
 * view fades to fadeColor over fadeSeconds, the destination loads, and the
 * Fade clears over the same fadeSeconds in the incoming scene. Simulation
 * and input keep running; while its outgoing fade runs, this component
 * ignores further triggers. fadeSeconds 0 (the default) is a hard cut.
 */
export class SceneTransition extends Component {
  static override componentName = 'SceneTransition'
  static override params = {
    scene: { label: 'Scene' },
    trigger: { label: 'Trigger', options: ['overlap', 'interact'] },
    fadeSeconds: { label: 'Fade seconds', min: 0, max: 5, step: 0.05 },
    fadeColor: { label: 'Fade color' },
  }

  /** Destination scene name. */
  scene = ''
  trigger: 'overlap' | 'interact' = 'overlap'
  /** Seconds of each half of the fade (out, then clear); 0 = hard cut. */
  fadeSeconds = 0
  /** `'black'`, `'white'` or `'#rrggbb'`. */
  fadeColor: CameraEffectColor = 'black'
  /** True while the outgoing fade runs: further triggers do nothing. */
  private _fadingOut = false

  override onReady(): void {
    if (this.trigger === 'interact' && !this.entity.has(Interactable)) {
      console.warn(
        `[waica] SceneTransition on "${this.entity.name}" has trigger:"interact" but no ` +
          'sibling Interactable; it will never fire.',
      )
    }
  }

  override onCollide(_other: Entity): void {
    if (this.trigger !== 'overlap') return
    this.fire()
  }

  override onInteract(_initiator: Entity): void {
    if (this.trigger !== 'interact') return
    this.fire()
  }

  private fire(): void {
    if (!(this.fadeSeconds > 0)) {
      this.game.loadSceneByName(this.scene)
      return
    }
    if (this._fadingOut) return
    const { game, fadeSeconds } = this
    game.cameraEffects.fade({ to: this.fadeColor, seconds: fadeSeconds })
    this._fadingOut = true
    // Scheduled on Game Time, not on `fade.done`: a promise settles in a
    // microtask, after a whole multi-step frame or Runtime Bridge `step`,
    // while this timer fires on the exact step the fade has covered the view.
    game.time.after(
      fadeSeconds,
      () => {
        const swapping = game.loadSceneByName(this.scene)
        if (!swapping) this._fadingOut = false
        // Session-scoped, zero-delay: fires at the start of the next step,
        // after the queued swap has applied, so the clear runs in the
        // incoming scene (or, if the swap failed, uncovers this one).
        game.time.after(0, () => game.cameraEffects.fade({ to: 'clear', seconds: fadeSeconds }), {
          scope: 'session',
        })
      },
      { owner: this.entity },
    )
  }
}
