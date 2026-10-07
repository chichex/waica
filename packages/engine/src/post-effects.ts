import {
  resolveColorGrade,
  resolvePostEffects,
  resolveVignette,
  type ColorGradeEffect,
  type PostEffectsState,
  type VignetteEffect,
} from './scene-render-options.js'
import type { ScenePostJson } from './scene.js'

/**
 * `game.post` (issue #78): the live scene's Post Effects — a vignette and a
 * color grade, each off (null) unless its scene declares it or a game turns
 * it on. With either on, the frame renders through a render target and one
 * full-screen pass; with both off, it draws straight to the canvas. Camera
 * Effects (ADR 0020) sit above and are never altered. They die with their scene.
 */
export class GamePost {
  private state: PostEffectsState = resolvePostEffects(undefined)

  /** The vignette now, a copy; null when off. */
  get vignette(): VignetteEffect | null {
    const { vignette } = this.state
    return vignette ? { ...vignette } : null
  }

  /** Turns the vignette on (both fields, clamped to 0..1) or off with null. */
  set vignette(value: VignetteEffect | null) {
    this.state = { ...this.state, vignette: resolveVignette(value) }
  }

  /** The color grade now, a copy; null when off. */
  get colorGrade(): ColorGradeEffect | null {
    const { colorGrade } = this.state
    return colorGrade ? { ...colorGrade } : null
  }

  /** Turns the color grade on (absent fields neutral, values clamped) or off with null. */
  set colorGrade(value: Partial<ColorGradeEffect> | null) {
    this.state = { ...this.state, colorGrade: resolveColorGrade(value) }
  }

  /** Whether any Post Effect is on. */
  get active(): boolean {
    return this.state.vignette !== null || this.state.colorGrade !== null
  }

  /** Adopts a scene's `render.post`, replacing whatever the previous scene left. Called by Game. */
  loadScene(json: ScenePostJson | undefined): void {
    this.state = resolvePostEffects(json)
  }

  /** Every effect off again. */
  unloadScene(): void {
    this.loadScene(undefined)
  }
}
