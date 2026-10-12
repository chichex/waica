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
  /** The clip playing now, undefined (or absent) before the first `play`. */
  readonly current?: string
  /** Every name `play` accepts. */
  readonly clipNames: readonly string[]
  /** True once a non-looping clip reached its end; false again after `play`. */
  readonly clipFinished: boolean
  play(name: string): void
  /**
   * The 2D mirror. A target without it is never flipped: a directional clip
   * resolved through a mirror plays unmirrored there, and the machine warns
   * once per state.
   */
  setFlipX?(flip: boolean): void
}

/**
 * Duck-typed like the facing provider: the first sibling with a `play`
 * function and a `clipNames` member is the target, whatever its class. The
 * member is tested with `in`, never read: a target computes `clipNames` in a
 * getter, and this runs on every Simulation Step of every machine.
 */
export function isClipTarget(component: Component): component is Component & ClipTarget {
  return 'play' in component && typeof component.play === 'function' && 'clipNames' in component
}
