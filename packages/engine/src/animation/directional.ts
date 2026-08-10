import type { AnimationContract } from './contract.js'

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
 * Walks the exact `<state>-<dir>` clip, then the declared directional
 * fallback chain (accumulating flips), cycle-safe. Undefined at a dead end —
 * callers decide what to try next, instead of this reaching for anything else.
 */
function directionalChain(
  animation: DirectionalAnimation,
  available: ReadonlySet<string>,
  state: string,
  facing: string,
): ResolvedDirectionalClip | undefined {
  const seen = new Set<string>()
  let dir: string | undefined = facing
  let flip = false
  while (dir && !seen.has(dir)) {
    const candidate = `${state}-${dir}`
    if (available.has(candidate)) return { clip: candidate, flip }
    seen.add(dir)
    const fallback: DirectionalFallback | undefined = animation.fallbacks?.[dir]
    if (!fallback) break
    if (fallback.flip) flip = !flip
    dir = fallback.dir
  }
  return undefined
}

/**
 * Resolves state × facing to a playable clip: the exact `<state>-<dir>`
 * clip, else the declared directional fallback chain (accumulating flips).
 * On a dead end, walks the base AnimationContract's state fallback chain
 * (cycle-safe) and, for each candidate state in turn, retries the
 * directional chain against it before trying its bare name. An invalid
 * facing, or a chain that dead-ends everywhere, resolves to nothing rather
 * than guessing — the caller's name-based fallback path handles that.
 */
export function resolveDirectionalClip(
  animation: DirectionalAnimation,
  available: Iterable<string>,
  state: string,
  facing: string,
): ResolvedDirectionalClip {
  if (!animation.directions.includes(facing)) return { clip: undefined, flip: false }
  const set = new Set(available)

  const direct = directionalChain(animation, set, state, facing)
  if (direct) return direct

  const seenStates = new Set<string>()
  let candidate: string | undefined = state
  while (candidate && !seenStates.has(candidate)) {
    seenStates.add(candidate)
    if (candidate !== state) {
      const viaDirection = directionalChain(animation, set, candidate, facing)
      if (viaDirection) return viaDirection
    }
    if (set.has(candidate)) return { clip: candidate, flip: false }
    candidate = animation.contract.fallbacks[candidate]
  }
  return { clip: undefined, flip: false }
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
