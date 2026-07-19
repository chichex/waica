import {
  AnimatedSprite,
  Component,
  missingClips,
  resolveClip,
  type AnimationContract,
} from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Contrato de animaciones del arquetipo plataformero: esto es lo que el
 * motor le pide al usuario para su personaje. Con menos clips el juego
 * sigue andando por la cadena de fallbacks.
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

/** Estado del movimiento → clip deseado. Pura, para testear sin motor. */
export function pickClip(state: PlatformerAnimState, runThreshold: number): string {
  if (!state.grounded) return state.vy > 0 ? 'jump' : 'fall'
  return Math.abs(state.vx) > runThreshold ? 'run' : 'idle'
}

/**
 * Conecta PlatformerMovement con AnimatedSprite según el contrato del
 * arquetipo. El flip izquierda/derecha ya lo hace el movimiento con la
 * escala de la entidad — acá solo se elige el clip.
 */
export class PlatformerAnimator extends Component {
  static override componentName = 'PlatformerAnimator'
  static override params = {
    runThreshold: { label: 'Umbral de correr', min: 0, max: 5, step: 0.1 },
  }

  runThreshold = 0.5
  contract: AnimationContract = PLATFORMER_ANIMATION_CONTRACT

  override onReady(): void {
    const sprite = this.entity.get(AnimatedSprite)
    if (!sprite) return
    const missing = missingClips(this.contract, Object.keys(sprite.clips))
    if (missing.length > 0) {
      console.warn(
        `[waica] "${this.entity.name}": faltan clips del contrato plataformero: ${missing.join(', ')} — se usan fallbacks`,
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
