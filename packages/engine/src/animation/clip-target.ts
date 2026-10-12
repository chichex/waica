import type { Component } from '../component.js'

/**
 * The Clip Target (issue #166): the one sibling component a StateMachine
 * plays clips through — `AnimatedSprite` in a 2D scene, `Animator` in a 3D
 * one. The machine asks for a clip by name on entering a state, reads which
 * names exist and which one runs, and learns from `clipFinished` that a
 * one-shot clip ended (the `clip:end` trigger). `setFlipX` is the 2D
 * directional contract's mirror; a target without it is never flipped.
 */
export interface ClipTarget {
  /** The clip playing now, undefined before the first `play`. */
  readonly current: string | undefined
  /** Every name `play` accepts. */
  readonly clipNames: readonly string[]
  /** True once a non-looping clip reached its end; false again after `play`. */
  readonly clipFinished: boolean
  play(name: string): void
  setFlipX?(flip: boolean): void
}

/**
 * Duck-typed like the facing provider: the first sibling with a `play`
 * function and a `clipNames` array is the target, whatever its class.
 */
export function isClipTarget(component: Component): component is Component & ClipTarget {
  return 'play' in component && typeof component.play === 'function' && 'clipNames' in component && Array.isArray(component.clipNames)
}
