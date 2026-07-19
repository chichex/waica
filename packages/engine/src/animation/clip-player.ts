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
    const idx = Math.floor(this.t * this.fps)
    const n = this.frames.length
    const clamped = this.loop ? idx % n : Math.min(idx, n - 1)
    return this.frames[clamped] ?? 0
  }
}
