import * as THREE from 'three/webgpu'
import type { AnimatorClipOverride } from './animator.js'
import { BlendSource, type BlendPoint } from './animator-sources.js'

/** One point of a blend: a clip of the file and the parameter value at which it plays alone. */
export interface AnimatorBlendPoint {
  clip: string
  at: number
}

/**
 * A 1D blend (issue #205, ADR 0033): a virtual clip of the Animator that mixes
 * the file's clips by a named parameter, the two points around its value
 * weighted linearly, every clip on one shared phase.
 */
export interface AnimatorBlend {
  /** The parameter `setParam` writes. */
  param: string
  /** The clips and their thresholds, played in threshold order. */
  points: AnimatorBlendPoint[]
  /** Seconds the parameter takes to approach a new value; 0.15 by default, 0 follows at once. */
  smoothing?: number
}

/** The smoothing of a blend that does not set one. */
export const DEFAULT_BLEND_SMOOTHING = 0.15

/** What building an Animator's blends needs from it. */
export interface BlendBuild {
  readonly blends: Readonly<Record<string, unknown>>
  readonly clips: Readonly<Record<string, AnimatorClipOverride>>
  readonly mixer: THREE.AnimationMixer
  /** The file's clips. */
  readonly animations: readonly THREE.AnimationClip[]
  /** The smoothed value of a parameter. */
  readonly value: (param: string) => number
  readonly warn: (key: string, message: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The parameter a blend reads, or undefined when it names none. */
export function blendParam(blend: unknown): string | undefined {
  const param = isRecord(blend) ? blend.param : undefined
  return typeof param === 'string' && param !== '' ? param : undefined
}

/** A blend's smoothing: its own when that is a finite number ≥ 0, else the default. */
export function blendSmoothing(blend: unknown): number {
  const smoothing = isRecord(blend) ? blend.smoothing : undefined
  return typeof smoothing === 'number' && Number.isFinite(smoothing) && smoothing >= 0 ? smoothing : DEFAULT_BLEND_SMOOTHING
}

/**
 * The blends that can play on this file, as mix sources: a blend named like a
 * clip of the file loses to it, a point whose clip the file lacks (another
 * blend's name included) is skipped, and a blend left with no point does not
 * play. Each case warns once.
 */
export function buildBlendSources(build: BlendBuild): BlendSource[] {
  const clips = new Map(build.animations.map((clip) => [clip.name, clip]))
  const sources: BlendSource[] = []
  for (const [name, blend] of Object.entries(build.blends)) {
    if (clips.has(name)) {
      build.warn(`blend:${name}`, `blend "${name}" has the name of a clip of the file; the clip plays`)
      continue
    }
    const param = blendParam(blend)
    const points = param === undefined ? [] : playablePoints(name, blend, { build, clips })
    if (param === undefined) build.warn(`blend:${name}`, `blend "${name}" names no param; it does not play`)
    else if (points.length === 0) build.warn(`blend:${name}`, `blend "${name}" has no point to play; it does not play`)
    else sources.push(new BlendSource(name, points, () => build.value(param)))
  }
  return sources
}

/** What resolving one blend's points reads: the build and the file's clips by name. */
interface PointScope {
  readonly build: BlendBuild
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>
}

/** A point's clip name and threshold as authored, whatever their types. */
function authoredPoint(point: unknown): { clip: string; at: unknown } {
  if (!isRecord(point)) return { clip: String(point), at: undefined }
  return { clip: typeof point.clip === 'string' ? point.clip : String(point.clip), at: point.at }
}

/** A blend's points that name a clip of the file at a finite threshold, in threshold order, each over an action of its own. */
function playablePoints(name: string, blend: unknown, scope: PointScope): BlendPoint[] {
  const authored: unknown[] = isRecord(blend) && Array.isArray(blend.points) ? blend.points : []
  const points: BlendPoint[] = []
  for (const { clip: clipName, at } of authored.map(authoredPoint)) {
    const clip = scope.clips.get(clipName)
    const skip = (why: string): void => scope.build.warn(`blend:${name}:${clipName}`, `blend "${name}" skips point "${clipName}": ${why}`)
    if (!clip) skip('the file has no such clip')
    else if (typeof at !== 'number' || !Number.isFinite(at)) skip('its "at" is not a finite number')
    else points.push(blendPoint(clip, at, scope.build))
  }
  return points.sort((a, b) => a.at - b.at)
}

/**
 * A point's own action, over a copy of the clip that shares its tracks: the
 * mixer keeps one action per clip, and a blend's clips keep the blend's phase
 * whatever the same clip does when it plays on its own. The mixer never
 * advances it (time scale 0): the blend sets its time every step.
 */
function blendPoint(clip: THREE.AnimationClip, at: number, build: BlendBuild): BlendPoint {
  const action = build.mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, clip.tracks, clip.blendMode))
  action.timeScale = 0
  const speed = build.clips[clip.name]?.speed
  const rate = typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? speed : 1
  return { clip: clip.name, at, action, duration: clip.duration, cycle: clip.duration / rate }
}
