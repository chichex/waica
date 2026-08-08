import { resolveClip, type AnimationContract } from './contract.js'

/**
 * Directional animation contract: the archetype declares which facing
 * directions exist, how clips are named per direction (`<state>-<dir>`),
 * and how a missing direction degrades — including mirroring, so west can
 * reuse east art flipped. Extends the base AnimationContract thesis to
 * genres where characters face more than one way (top-down, isometric).
 */
export interface DirectionalFallback<Dir extends string = string> {
  dir: Dir
  /** Mirror the resolved clip horizontally (e.g. west plays east flipped). */
  flip?: boolean
}

export interface DirectionalAnimation<Dir extends string = string> {
  /** Declared facing directions, e.g. ['n', 's', 'e', 'w'] — 8 for isometric. */
  directions: readonly Dir[]
  /** Directional degradation: a missing facing resolves to another, optionally mirrored. */
  fallbacks?: Partial<Record<Dir, DirectionalFallback<Dir>>>
  /** State-level degradation chain applied when no directional clip resolves. */
  contract: AnimationContract
}

export interface ResolvedDirectionalClip {
  clip: string | undefined
  flip: boolean
}

/**
 * Resolves state × facing to a playable clip: the exact `<state>-<dir>`
 * clip, else the declared directional fallback chain (accumulating flips),
 * else the base AnimationContract chain via resolveClip, unflipped.
 */
export function resolveDirectionalClip(
  animation: DirectionalAnimation,
  available: Iterable<string>,
  state: string,
  facing: string,
): ResolvedDirectionalClip {
  const set = new Set(available)
  const seen = new Set<string>()
  let dir: string | undefined = facing
  let flip = false
  while (dir && !seen.has(dir)) {
    const candidate = `${state}-${dir}`
    if (set.has(candidate)) return { clip: candidate, flip }
    seen.add(dir)
    const fallback: DirectionalFallback | undefined = animation.fallbacks?.[dir]
    if (!fallback) break
    if (fallback.flip) flip = !flip
    dir = fallback.dir
  }
  return { clip: resolveClip(animation.contract, set, state), flip: false }
}

let installed: DirectionalAnimation | null = null

/** Installs (or clears, with null) the active directional contract. */
export function installDirectionalAnimation(animation: DirectionalAnimation | null): void {
  installed = animation
}

/** The active directional contract, if an archetype installed one. */
export function installedDirectionalAnimation(): DirectionalAnimation | null {
  return installed
}

/**
 * The explicit seam a driving component (a motor) opts into so StateMachine
 * can resolve directional clips: it reports the entity's current facing as
 * one of the contract's declared directions.
 */
export interface AnimationFacingProvider {
  getAnimationFacing(): string
}

export function isAnimationFacingProvider(value: unknown): value is AnimationFacingProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AnimationFacingProvider).getAnimationFacing === 'function'
  )
}

type AssertDirectionalAnimation<T extends DirectionalAnimation<IsoDirection>> = T
type IsoDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

// Type-only fixture: proves the contract types for eight directions
// (isometric-ready) — checked by tsc, erased from the engine dist.
type _IsoDirectionalTypeFixture = AssertDirectionalAnimation<{
  directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  fallbacks: {
    w: { dir: 'e'; flip: true }
    nw: { dir: 'ne'; flip: true }
    sw: { dir: 'se'; flip: true }
  }
  contract: { required: ['idle']; fallbacks: {} }
}>
