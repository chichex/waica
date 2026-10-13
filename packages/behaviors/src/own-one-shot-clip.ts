import type { Animator, StateMachine } from '@waica/engine'

/**
 * Is `animator` playing the machine's current state's own clip as a one-shot
 * (`loop: false`)? Only then can `clip:end` ever fire. A clip that is missing,
 * looping, still loading or whose glb failed never ends, so a state that
 * leaves on `clip:end` must end on time instead (issue #181).
 */
export function playsOwnOneShot(animator: Animator, fsm: StateMachine): boolean {
  const clip = fsm.states[fsm.current]?.clip ?? fsm.current
  return animator.current === clip && animator.clips[clip]?.loop === false
}

/** Does the current state, or the any-state `'*'`, have an edge on `trigger`? */
export function takesTrigger(fsm: StateMachine, trigger: string): boolean {
  return [fsm.states[fsm.current], fsm.states['*']].some((state) => state?.transitions?.some((edge) => edge.on === trigger))
}
