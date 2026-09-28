import type { SceneComponentJson, StateJson } from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isPlayableClip } from './clip-resolution.js'
import { siblingClips } from './component-validation.js'
import { objectRecord } from './component-metadata.js'
import { isBoundAction } from './param-reference-resolution.js'
import { directFiles } from './project-path.js'
import { add, type ValidationContext } from './validation-context.js'

/** Where the machines being checked live, and the clips their sibling AnimatedSprite declares. */
interface MachineScope {
  readonly file: string
  readonly ref: string | undefined
  readonly context: ValidationContext
  readonly clips: Set<string> | undefined
}

/** One state of a machine, with the machine's whole state table for cross-state checks. */
interface MachineState {
  readonly name: string
  readonly definition: StateJson
  readonly states: Record<string, StateJson>
}

function machineStates(component: SceneComponentJson): Record<string, StateJson> {
  return objectRecord(component.props?.states) as Record<string, StateJson>
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function projectRoleStateSources(projectPath: string): Promise<Map<string, string[]>> {
  const sources = new Map<string, string[]>()
  for (const file of await directFiles(path.join(projectPath, 'src/roles'), '.ts')) {
    const source = await readFile(path.join(projectPath, 'src/roles', file), 'utf8')
    for (const match of source.matchAll(/\bdefine(?:Role|States)\s*\(\s*(['"])([^'"]+)\1/g)) {
      const role = match[2]
      if (!role) continue
      sources.set(role, [...(sources.get(role) ?? []), source.slice(match.index)])
    }
  }
  return sources
}

function roleSourceHasState(source: string, state: string): boolean {
  const statesMarkers = [...source.matchAll(/\bstates\s*:/g)]
  const candidate = statesMarkers.at(-1)
  const registration = candidate ? source.slice(candidate.index) : source
  return new RegExp(`\\b${escapedRegex(state)}\\s*:`).test(registration)
}

/** Mirrors flat state files and textually recognizes project role registrations. */
function stateCodeExists(
  role: string,
  state: string,
  context: ValidationContext,
): boolean {
  const roleStates = context.manifest.bundle.roles[role]?.states
  const logicStates = context.manifest.bundle.logicSets?.[role]
  return (
    (!!roleStates && Object.hasOwn(roleStates, state)) ||
    (!!logicStates && Object.hasOwn(logicStates, state)) ||
    context.stateFiles.has(state) ||
    (context.roleStateSources.get(role) ?? []).some((source) =>
      roleSourceHasState(source, state),
    )
  )
}

export function validateStateMachines(
  components: SceneComponentJson[],
  file: string,
  ref: string | undefined,
  context: ValidationContext,
): void {
  const scope: MachineScope = { file, ref, context, clips: siblingClips(components) }
  for (const machine of components.filter((component) => component.type === 'StateMachine')) {
    validateMachine(machine, scope)
  }
}

function validateMachine(machine: SceneComponentJson, scope: MachineScope): void {
  const states = machineStates(machine)
  const realNames = Object.keys(states).filter((name) => name !== '*')
  const role = typeof machine.props?.role === 'string' ? machine.props.role : ''
  const initial = initialState(machine, realNames)
  for (const name of realNames) {
    const state: MachineState = { name, definition: objectRecord(states[name]), states }
    validateStateClip(state, scope)
    validateStateTransitions(state, scope)
    if (name !== initial && !isTransitionTarget(states, name)) {
      add(
        scope.context,
        'warning',
        'unreachable-state',
        `Nothing transitions to state "${name}" and it is not initial.`,
        scope.file,
        scope.ref ?? name,
      )
    }
    if (!stateCodeExists(role, name, scope.context)) {
      add(
        scope.context,
        'info',
        'no-state-code',
        `State "${name}" has no built-in code, project role registration or src/states/${name}.ts.`,
        scope.file,
        scope.ref ?? name,
      )
    }
  }
}

/** The machine's declared initial state, else its first real state. */
function initialState(machine: SceneComponentJson, realNames: readonly string[]): string {
  const declared = machine.props?.initial
  return typeof declared === 'string' && declared ? declared : (realNames[0] ?? '')
}

function validateStateClip({ name, definition }: MachineState, scope: MachineScope): void {
  const explicitClip = typeof definition.clip === 'string' ? definition.clip : undefined
  const clip = explicitClip ?? name
  // No "empty means none" special case here: the runtime looks up
  // `this.states[state]?.clip ?? state`, and '' survives that nullish
  // coalesce, so an explicit empty clip is looked up literally and must
  // be validated like any other explicit value (unlike Collectible.stat,
  // which the runtime genuinely treats as unset).
  if (scope.clips && !isPlayableClip(scope.clips, clip, scope.context.manifest.animation)) {
    add(
      scope.context,
      explicitClip === undefined ? 'warning' : 'error',
      'missing-clip',
      `State "${name}" uses missing animation clip "${clip}".`,
      scope.file,
      explicitClip === undefined ? (scope.ref ?? name) : `StateMachine.states.${name}.clip`,
    )
  }
}

function validateStateTransitions(state: MachineState, scope: MachineScope): void {
  const transitions = Array.isArray(state.definition.transitions) ? state.definition.transitions : []
  for (const transition of transitions) {
    if (!transition || typeof transition !== 'object') continue
    validateTransitionTarget((transition as { to?: unknown }).to, state, scope)
    validateTransitionInput((transition as { on?: unknown }).on, scope)
  }
}

function validateTransitionTarget(to: unknown, { name, states }: MachineState, scope: MachineScope): void {
  if (typeof to === 'string' && to !== '*' && !Object.hasOwn(states, to)) {
    add(
      scope.context,
      'warning',
      'dangling-transition-target',
      `State "${name}" transitions to missing state "${to}".`,
      scope.file,
      scope.ref ?? name,
    )
  }
}

function validateTransitionInput(on: unknown, scope: MachineScope): void {
  if (typeof on !== 'string' || !on.startsWith('input:')) return
  const action = on.slice('input:'.length)
  if (!isBoundAction(scope.context.bindings, action)) {
    add(
      scope.context,
      'warning',
      'input-action-unbound',
      `Input action "${action}" has no bindings.`,
      scope.file,
      action,
    )
  }
}

function isTransitionTarget(states: Record<string, StateJson>, name: string): boolean {
  return Object.values(states).some((candidate) =>
    (Array.isArray(candidate?.transitions) ? candidate.transitions : []).some(
      (transition) => transition?.to === name,
    ),
  )
}
