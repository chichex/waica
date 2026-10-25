import * as THREE from 'three/webgpu'
import type { MixSource } from './animator-mix.js'

/** A clip of the file as one sound of the mix: its own action, advanced by the mixer at its `speed`. */
export class ClipSource implements MixSource {
  constructor(
    readonly name: string,
    private readonly action: THREE.AnimationAction,
  ) {}

  /** A `loop: false` clip clamps when it ends, which three marks by pausing it: nothing else pauses an action here. */
  get finished(): boolean {
    return this.action.loop === THREE.LoopOnce && this.action.paused
  }

  get time(): number {
    return this.action.time
  }

  get progress(): number {
    const { duration } = this.action.getClip()
    return duration > 0 ? Math.min(this.action.time / duration, 1) : 1
  }

  get playing(): boolean {
    return this.action.isRunning()
  }

  start(): void {
    this.action.reset().play()
  }

  stop(): void {
    this.action.stop()
  }

  apply(weight: number): void {
    this.action.setEffectiveWeight(weight)
  }

  addWeights(weight: number, into: Record<string, number>): void {
    into[this.name] = (into[this.name] ?? 0) + weight
  }
}

/** One point of a blend as it plays: its clip, threshold and own action, and the clip's length and cycle at its speed. */
export interface BlendPoint {
  readonly clip: string
  readonly at: number
  readonly action: THREE.AnimationAction
  /** The clip's length in seconds. */
  readonly duration: number
  /** Seconds of one cycle at the clip's `speed` override. */
  readonly cycle: number
}

/**
 * A blend as one sound of the mix (issue #205, ADR 0033): its points share
 * one normalized phase, advanced by the step over the cycle interpolated by
 * the points' shares, so walk and run put their feet down together; each
 * point's action sits at that phase of its own clip, weighted by its share.
 */
export class BlendSource implements MixSource {
  private phase = 0

  constructor(
    readonly name: string,
    private readonly points: readonly BlendPoint[],
    private readonly value: () => number,
  ) {}

  /** A blend loops: it never finishes. */
  get finished(): boolean {
    return false
  }

  /** The phase as seconds of the interpolated cycle. */
  get time(): number {
    return this.phase * this.cycle(blendShares(this.points, this.value()))
  }

  get progress(): number {
    return this.phase
  }

  get playing(): boolean {
    return true
  }

  start(): void {
    this.phase = 0
    for (const point of this.points) point.action.reset().play()
  }

  stop(): void {
    for (const point of this.points) point.action.stop()
  }

  apply(weight: number, dt: number): void {
    const shares = blendShares(this.points, this.value())
    const cycle = this.cycle(shares)
    if (cycle > 0) {
      this.phase += dt / cycle
      this.phase -= Math.floor(this.phase)
    }
    for (const [index, point] of this.points.entries()) {
      point.action.time = this.phase * point.duration
      point.action.setEffectiveWeight(weight * (shares[index] ?? 0))
    }
  }

  addWeights(weight: number, into: Record<string, number>): void {
    const shares = blendShares(this.points, this.value())
    for (const [index, point] of this.points.entries()) {
      const share = shares[index] ?? 0
      if (share > 0) into[point.clip] = (into[point.clip] ?? 0) + weight * share
    }
  }

  private cycle(shares: readonly number[]): number {
    return this.points.reduce((sum, point, index) => sum + (shares[index] ?? 0) * point.cycle, 0)
  }
}

/**
 * Each point's share of a 1D blend at `value`: the two points around it,
 * weighted linearly by where it falls between their thresholds; past either
 * end, that end alone. `points` are in threshold order.
 */
export function blendShares(points: readonly { readonly at: number }[], value: number): number[] {
  const shares = points.map(() => 0)
  const last = points.length - 1
  const first = points[0]
  const final = points[last]
  if (!first || !final) return shares
  if (value <= first.at) shares[0] = 1
  else if (value >= final.at) shares[last] = 1
  else {
    const index = points.findIndex((point, i) => i < last && value < (points[i + 1]?.at ?? point.at))
    const low = points[index]?.at ?? first.at
    const high = points[index + 1]?.at ?? low
    const t = high > low ? (value - low) / (high - low) : 1
    shares[index] = 1 - t
    shares[index + 1] = t
  }
  return shares
}
