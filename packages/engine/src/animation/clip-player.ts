export interface ClipDef {
  /** Índices de frame dentro del spritesheet (fila×cols + col). */
  frames: number[]
  fps: number
  /** Por defecto true; en false se clava en el último frame. */
  loop?: boolean
}

/**
 * Avance de un clip en el tiempo. Lógica pura (sin three ni DOM) para
 * poder testearla determinísticamente.
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

  /** Avanza el reloj y devuelve el frame del sheet a mostrar. */
  advance(dt: number): number {
    this.t += dt
    const idx = Math.floor(this.t * this.fps)
    const n = this.frames.length
    const clamped = this.loop ? idx % n : Math.min(idx, n - 1)
    return this.frames[clamped] ?? 0
  }
}
