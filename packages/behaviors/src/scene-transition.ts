import { Component, type Entity } from '@waica/engine'
import { Interactable } from './interactable.js'
import { isPlayer } from './player-identity.js'

/**
 * Replaces the live scene with `scene` (its file's stem, e.g.
 * "cave.scene.json" -> "cave") when fired — a door, or any entity a player
 * crosses or interacts with to leave the current map. Names only its
 * destination: the incoming scene places its own Player wherever that
 * scene authored it (no named entry points).
 *
 * With trigger:'overlap' (the default) it fires like Collectible/Hazard:
 * the player's Hitbox overlapping its own — requires a sibling Hitbox.
 * With trigger:'interact' it implements no radius or prompt of its own:
 * it needs a sibling Interactable and fires from the shared nearest-wins
 * interact scan (interactable.ts's fireInteract), so a door and an NPC in
 * range arbitrate themselves with no new rule.
 */
export class SceneTransition extends Component {
  static override componentName = 'SceneTransition'
  static override params = {
    scene: { label: 'Scene' },
    trigger: { label: 'Trigger', options: ['overlap', 'interact'] },
  }

  /** Destination scene name. */
  scene = ''
  trigger: 'overlap' | 'interact' = 'overlap'

  override onReady(): void {
    if (this.trigger === 'interact' && !this.entity.has(Interactable)) {
      console.warn(
        `[waica] SceneTransition on "${this.entity.name}" has trigger:"interact" but no ` +
          'sibling Interactable; it will never fire.',
      )
    }
  }

  override onCollide(other: Entity): void {
    if (this.trigger !== 'overlap') return
    if (!isPlayer(other)) return
    this.fire()
  }

  override onInteract(_initiator: Entity): void {
    if (this.trigger !== 'interact') return
    this.fire()
  }

  private fire(): void {
    this.game.loadSceneByName(this.scene)
  }
}
