import type { Entity } from '../entity'
import type { Game } from '../game'
import type { StateJson, StateMachine } from './state-machine'

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
 * A named bundle of state code. Two entries are special: '*' is the
 * always-hook — it runs every frame no matter which state is active
 * (per-frame bookkeeping like motor timers lives there) — and 'default'
 * is the fallback — a state that doesn't define a phase inherits it, so
 * a custom state keeps the stock body update unless it overrides it.
 */
export type StateLogic = Record<string, StateHooks>

const sets = new Map<string, StateLogic>()

/**
 * Registers state code under a logic-set name. A role's name is also its
 * logic-set name, so this is how a role's code is extended: registering
 * again with the same name merges per state.
 */
export function defineStates(name: string, states: StateLogic): void {
  sets.set(name, { ...sets.get(name), ...states })
}

/** A role's starter state graph — what new characters of the role begin with. */
export interface RoleGraph {
  initial: string
  states: Record<string, StateJson>
}

/**
 * A character role: the whole behavior package behind one answer to
 * "what is this character?". The editor uses the description to let the
 * role explain itself, and the driver + graph to install the package.
 */
export interface RoleDefinition {
  /** One plain-language line: what this role is and does. */
  description: string
  /**
   * Component the role's states move (they early-return without it).
   * Several roles may share one driver — the contract is N roles : 1 driver.
   */
  driver?: string
  /** Starter graph installed when a character adopts this role. */
  graph?: RoleGraph
  /** The role's state code, registered as the role's logic set. */
  states?: StateLogic
  /**
   * Signals the role's code emits (name → plain-language description).
   * The editor lists them wherever a transition asks for a signal, so
   * users pick from a vocabulary instead of typing names blind.
   */
  signals?: Record<string, string>
}

const roles = new Map<string, RoleDefinition>()

/** All state-registry data an archetype installs before project extensions. */
export interface ArchetypeBundle {
  roles: Readonly<Record<string, RoleDefinition>>
  /** Extra named logic sets that are not themselves roles. */
  logicSets?: Readonly<Record<string, StateLogic>>
}

/** Clears role definitions and every named logic set. */
export function resetRegistries(): void {
  roles.clear()
  sets.clear()
}

/**
 * Replaces the active registry contents with one archetype's complete bundle.
 * Project defineRole/defineStates calls may extend this clean baseline after it
 * is installed.
 */
export function installArchetype(bundle: ArchetypeBundle): void {
  resetRegistries()
  for (const [name, def] of Object.entries(bundle.roles)) defineRole(name, def)
  for (const [name, states] of Object.entries(bundle.logicSets ?? {})) {
    defineStates(name, states)
  }
}

/**
 * Registers a character role. Prefabs adopt it via the StateMachine's
 * `role` prop; the role's name doubles as its logic-set name, so
 * defineStates(name, {...}) extends its code. Registering an existing
 * role again merges its definition (and its states).
 */
export function defineRole(name: string, def: RoleDefinition): void {
  roles.set(name, { ...roles.get(name), ...def })
  if (def.states) defineStates(name, def.states)
}

/** The registered role, if any — driver, graph and description included. */
export function roleDefinition(name: string): RoleDefinition | undefined {
  return roles.get(name)
}

/** Every registered role name — for the editor's Role pickers. */
export function registeredRoles(): string[] {
  return [...roles.keys()]
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
