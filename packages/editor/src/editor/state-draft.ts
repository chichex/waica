import type { StateJson, StateTransitionJson } from '@waica/engine'
import type { MachineProps } from '../project/states'

/**
 * The editable form of one state's data in the StateEditorModal: transitions
 * as friendly parts instead of 'kind:arg' strings, and the save that applies
 * a (possibly renamed) state back onto the whole machine.
 */

/** One transition row being edited, as friendly parts of 'kind:arg → to'. */
export interface EdgeDraft {
  kind: 'input' | 'timer' | 'signal'
  arg: string
  to: string
}

export function parseEdge(t: StateTransitionJson): EdgeDraft {
  const sep = t.on.indexOf(':')
  const kind = sep > 0 ? t.on.slice(0, sep) : 'signal'
  return {
    kind: kind === 'input' || kind === 'timer' ? kind : 'signal',
    arg: sep > 0 ? t.on.slice(sep + 1) : t.on,
    to: t.to,
  }
}

function serializeEdge(e: EdgeDraft): StateTransitionJson {
  return { on: `${e.kind}:${e.arg}`, to: e.to }
}

/** 'input:jump' → 'key press jump', for the read-only incoming-edges line. */
export function describeTrigger(on: string): string {
  const e = parseEdge({ on, to: '' })
  if (e.kind === 'input') return `key press ${e.arg}`
  if (e.kind === 'timer') return `after ${e.arg}s`
  return `signal ${e.arg}`
}

/** States may not take the names the logic set reserves for its hooks. */
export const RESERVED_STATE_NAMES = new Set(['*', 'default'])

/** Placeholder per trigger kind, so an empty arg reads as instructions. */
export const ARG_HINTS: Record<EdgeDraft['kind'], string> = {
  input: 'action…',
  timer: 'seconds…',
  signal: 'signal name…',
}

/** The edited state as the modal holds it before saving. */
export interface StateDraft {
  /** The state's name before the edit. */
  state: string
  /** The name it saves under (equal to `state` when not renamed). */
  nextName: string
  clip: string
  edges: EdgeDraft[]
}

/**
 * The machine's states and initial state after saving `draft`: the edited
 * state is stored under its new name, and every edge (its own included)
 * that targeted the old name follows the rename, as does the initial state.
 */
export function applyStateDraft(
  machine: MachineProps,
  draft: StateDraft,
): { states: Record<string, StateJson>; initial: string } {
  const { state, nextName } = draft
  const renamed: StateJson = {
    ...(draft.clip ? { clip: draft.clip } : {}),
    transitions: draft.edges.map(serializeEdge).map((t) => (t.to === state ? { ...t, to: nextName } : t)),
  }
  const states: Record<string, StateJson> = {}
  for (const [n, d] of Object.entries(machine.states)) {
    if (n === state) {
      states[nextName] = renamed
      continue
    }
    states[n] = {
      ...d,
      transitions: d?.transitions?.map((t) => (t.to === state ? { ...t, to: nextName } : t)),
    }
  }
  const initial = machine.initial === state ? nextName : machine.initial
  return { states, initial }
}
