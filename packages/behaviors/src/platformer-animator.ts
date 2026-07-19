import {
  AnimatedSprite,
  Component,
  missingClips,
  resolveClip,
  type AnimationContract,
} from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * The platformer archetype's animation contract: this is what the engine
 * asks the user for their character. With fewer clips the game keeps
 * working through the fallback chain.
 */
export const PLATFORMER_ANIMATION_CONTRACT: AnimationContract = {
  required: ['idle', 'run', 'jump', 'fall'],
  fallbacks: { run: 'idle', jump: 'idle', fall: 'jump' },
}

export interface PlatformerAnimState {
  grounded: boolean
  vx: number
  vy: number
}

/** Movement state → desired clip. Pure, testable without the engine. */
export function pickClip(state: PlatformerAnimState, runThreshold: number): string {
  if (!state.grounded) return state.vy > 0 ? 'jump' : 'fall'
  return Math.abs(state.vx) > runThreshold ? 'run' : 'idle'
}

/**
 * Wires PlatformerMovement to AnimatedSprite following the archetype's
 * contract. The left/right flip is already handled by the movement via
 * the entity scale — this only picks the clip.
 */
export class PlatformerAnimator extends Component {
  static override componentName = 'PlatformerAnimator'
  static override params = {
    runThreshold: { label: 'Run threshold', min: 0, max: 5, step: 0.1 },
  }

  runThreshold = 0.5
  contract: AnimationContract = PLATFORMER_ANIMATION_CONTRACT

  override onReady(): void {
    const sprite = this.entity.get(AnimatedSprite)
    if (!sprite) return
    const missing = missingClips(this.contract, Object.keys(sprite.clips))
    if (missing.length > 0) {
      console.warn(
        `[waica] "${this.entity.name}": missing clips from the platformer contract: ${missing.join(', ')} — falling back`,
      )
    }
  }

  override onUpdate(): void {
    const movement = this.entity.get(PlatformerMovement)
    const sprite = this.entity.get(AnimatedSprite)
    if (!movement || !sprite) return
    const wanted = pickClip(movement, this.runThreshold)
    const clip = resolveClip(this.contract, Object.keys(sprite.clips), wanted)
    if (clip) sprite.play(clip)
  }
}
