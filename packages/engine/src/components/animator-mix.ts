import { SIMULATION_TIME_EPSILON } from '../fixed-step.js'

/**
 * One thing an Animator can sound (issue #205): a clip of the file, or a
 * blend mixing several of them. The mix only weighs it; how it turns a weight
 * into actions, and how far it is, is its own.
 */
export interface MixSource {
  /** The clip or blend name `play` asked for. */
  readonly name: string
  /** True once a one-shot reached its end (a blend never finishes). */
  readonly finished: boolean
  /** Where it is, in seconds, for the Runtime Snapshot. */
  readonly time: number
  /** How far it is, from 0 at its start to 1 at its end. */
  readonly progress: number
  /** False when nothing of it advances (a finished one-shot holding its pose). */
  readonly playing: boolean
  /** Plays it from its start. */
  start(): void
  /** Stops its actions: a later start begins again at 0. */
  stop(): void
  /** Gives its actions their share of `weight` for the step about to run, `dt` seconds long. */
  apply(weight: number, dt: number): void
  /** Adds its share of each glb clip at `weight` into `into`. */
  addWeights(weight: number, into: Record<string, number>): void
}

interface Voice {
  readonly source: MixSource
  weight: number
  /** The weight it had when the running fade began, and the one it ends at. */
  from: number
  to: number
}

/**
 * The fades of one Animator (issue #205, ADR 0033), scheduled by the Animator
 * instead of three's `crossFadeTo`/`fadeOut`: entering a source moves it from
 * the weight it has to 1 over the fade, and every other sounding source from
 * the weight it has to 0 over that same fade, so an interrupted fade never
 * jumps and the weights always add up to 1. A source that reaches 0 stops.
 */
export class AnimatorMix {
  private voices: Voice[] = []
  private entered: Voice | undefined
  private elapsed = 0
  private duration = 0

  /** The source entered last: the one fading in, or sounding alone. */
  get target(): MixSource | undefined {
    return this.entered?.source
  }

  /**
   * Sounds `source` over `fade` seconds. One that still carries weight
   * continues from where it is; a silent one, or a finished one-shot, starts
   * at 0. With nothing sounding yet, or no fade, it cuts.
   */
  enter(source: MixSource, fade: number): void {
    const sounding = this.voices.some((voice) => voice.weight > 0)
    let voice = this.voices.find((candidate) => candidate.source === source)
    if (!voice) {
      voice = { source, weight: 0, from: 0, to: 1 }
      this.voices.push(voice)
      source.start()
    } else if (voice.weight <= 0 || source.finished) {
      source.start()
    }
    this.entered = voice
    if (!sounding || !(fade > 0 && Number.isFinite(fade))) {
      this.cutTo(voice)
      return
    }
    for (const each of this.voices) {
      each.from = each.weight
      each.to = each === voice ? 1 : 0
    }
    this.elapsed = 0
    this.duration = fade
  }

  /** Advances the running fade by `dt`, stops what fell silent and weighs the rest's actions for the step. */
  step(dt: number): void {
    if (this.duration > 0) {
      this.elapsed += dt
      // Steps of 1/60 add up to a hair under some fades (six make 0.09999…): within the epsilon the fade is over.
      const t = this.elapsed + SIMULATION_TIME_EPSILON >= this.duration ? 1 : this.elapsed / this.duration
      for (const voice of this.voices) voice.weight = t >= 1 ? voice.to : voice.from + (voice.to - voice.from) * t
      if (t >= 1) this.duration = 0
    }
    this.voices = this.voices.filter((voice) => {
      if (voice.to > 0 || voice.weight > 0) return true
      voice.source.stop()
      return false
    })
    for (const voice of this.voices) voice.source.apply(voice.weight, dt)
  }

  /** Each glb clip's weight, only those above 0, the leaving ones included. */
  weights(): Record<string, number> {
    const sum: Record<string, number> = {}
    for (const voice of this.voices) if (voice.weight > 0) voice.source.addWeights(voice.weight, sum)
    return Object.fromEntries(Object.entries(sum).filter(([, weight]) => weight > 0))
  }

  /** Stops every source and forgets them. */
  clear(): void {
    for (const voice of this.voices) voice.source.stop()
    this.voices = []
    this.entered = undefined
    this.duration = 0
  }

  private cutTo(voice: Voice): void {
    for (const other of this.voices) if (other !== voice) other.source.stop()
    this.voices = [voice]
    voice.weight = 1
    voice.from = 1
    voice.to = 1
    this.duration = 0
  }
}
