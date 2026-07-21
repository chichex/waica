import type { Entity } from '../entity'
import type { Game } from '../game'
import type { StateMachine } from './state-machine'

/** What state code receives: the entity, the game, and the machine itself. */
export interface StateContext {
  entity: Entity
  game: Game
  fsm: StateMachine
}

/** Code for one state. Every hook is optional — a state can be pure data. */
export interface StateHooks {
  onEnter?(ctx: StateContext): void
  onUpdate?(ctx: StateContext, dt: number): void
  onExit?(ctx: StateContext): void
}

/**
 * A named bundle of state code. The '*' entry is the set's always-hook:
 * it runs every frame no matter which state is active (per-frame
 * bookkeeping like motor timers lives there).
 */
export type StateLogic = Record<string, StateHooks>

const sets = new Map<string, StateLogic>()

/**
 * Registers state code under a logic-set name. Prefabs pick their set
 * with the StateMachine's `logic` prop. Calling again with the same name
 * merges per state — extending a set is just registering on top of it.
 */
export function defineStates(name: string, states: StateLogic): void {
  sets.set(name, { ...sets.get(name), ...states })
}

/** The registered code for a set, if any. */
export function logicSet(name: string): StateLogic | undefined {
  return sets.get(name)
}

/** Every registered set name — for error messages and editor pickers. */
export function registeredLogicSets(): string[] {
  return [...sets.keys()]
}

/** Closest registered set to a (likely typo'd) name, for the not-found error. */
export function closestLogicSet(name: string): string | undefined {
  let best: string | undefined
  let bestDistance = Infinity
  for (const candidate of sets.keys()) {
    const distance = editDistance(name, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j] as number
      row[j] = Math.min(
        previous + 1,
        (row[j - 1] as number) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = previous
    }
  }
  return row[b.length] as number
}
