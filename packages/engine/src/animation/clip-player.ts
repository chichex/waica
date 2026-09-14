import { SIMULATION_TIME_EPSILON } from '../fixed-step.js'

export interface ClipDef {
  /** Frame indices inside the spritesheet (row×cols + col). */
  frames: number[]
  fps: number
  /** Defaults to true; with false it sticks on the last frame. */
  loop?: boolean
}

/**
 * Advances a clip through time. Pure logic (no three, no DOM) so it can
 * be tested deterministically.
 */
export class ClipPlayer {
  private frames: number[] = [0]
  private fps = 1
  private loop = true
  private t = 0

  set(clip: ClipDef): void {
    this.frames = clip.frames.length > 0 ? clip.frames : [0]
    this.fps = clip.fps
    this.loop = clip.loop ?? true
    this.t = 0
  }

  /** Advances the clock and returns the sheet frame to show. */
  advance(dt: number): number {
    this.t += dt
    // this.t is a sum of SIMULATION_STEP-sized dts, which float error can
    // leave a hair under an exact multiple of a frame's duration; without
    // the epsilon, floor(t * fps) holds some frames one step short and
    // others one step long instead of a flat, even count per frame.
    const idx = Math.floor((this.t + SIMULATION_TIME_EPSILON) * this.fps)
    const n = this.frames.length
    const clamped = this.loop ? idx % n : Math.min(idx, n - 1)
    return this.frames[clamped] ?? 0
  }
}
