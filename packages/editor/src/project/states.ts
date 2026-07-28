import { logicSet, type SceneComponentJson, type StateJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'

/**
 * Editor-side helpers for the StateMachine component: normalized props,
 * per-state warnings (plain-language, consequence + action), the state
 * code file convention (src/states/<state>.ts) and its generated starter.
 */

export const STATES_DIR = 'src/states'
export const ROLES_DIR = 'src/roles'

/** Normalized StateMachine props (prefab JSON is free-form). */
export interface MachineProps {
  role: string
  initial: string
  states: Record<string, StateJson>
}

export function machineProps(comp: SceneComponentJson): MachineProps {
  const props = comp.props ?? {}
  return {
    role: typeof props.role === 'string' ? props.role : '',
    initial: typeof props.initial === 'string' ? props.initial : '',
    states: (props.states ?? {}) as Record<string, StateJson>,
  }
}

/** Real states of a machine — the '*' key holds wildcard edges, not a state. */
export function stateNames(machine: MachineProps): string[] {
  return Object.keys(machine.states).filter((name) => name !== '*')
}

export function stateFilePath(state: string): string {
  return `${STATES_DIR}/${state}.ts`
}

export function roleFilePath(role: string): string {
  return `${ROLES_DIR}/${role}.ts`
}

/** Basenames (foo.ts) of the .ts files in one src/<dir> folder. */
async function listSrcFiles(fs: ProjectFS, dir: string): Promise<string[]> {
  const tree = await fs.tree()
  const src = tree.find((n) => n.kind === 'dir' && n.name === 'src')
  const folder = src?.children?.find((n) => n.kind === 'dir' && n.name === dir)
  return (folder?.children ?? [])
    .filter((n) => n.kind === 'file' && n.name.endsWith('.ts'))
    .map((n) => n.name)
}

/** Basenames (dash.ts) of the project's state code files. */
export async function listStateFiles(fs: ProjectFS): Promise<string[]> {
  return listSrcFiles(fs, 'states')
}

/** Basenames (guard.ts) of the project's custom role files. */
export async function listRoleFiles(fs: ProjectFS): Promise<string[]> {
  return listSrcFiles(fs, 'roles')
}

/** Where a state's code comes from, for the ✓/ⓘ status line. */
export type StateCodeStatus =
  | { kind: 'builtin' } // registered in the editor: runs everywhere
  | { kind: 'file'; path: string } // project file: Play runs it too (play-code.ts)
  | { kind: 'none' }

export function stateCodeStatus(
  role: string,
  state: string,
  stateFiles: string[],
): StateCodeStatus {
  if (role && logicSet(role)?.[state]) return { kind: 'builtin' }
  if (stateFiles.includes(`${state}.ts`)) return { kind: 'file', path: stateFilePath(state) }
  return { kind: 'none' }
}

export interface StateIssue {
  /** ⚠ = probably a mistake; ⓘ = expected, but worth explaining. */
  level: 'warn' | 'info'
  /** Short line for the card row. */
  text: string
  /** Full plain-language explanation: consequence + what to do (tooltip). */
  detail: string
}

/** Everything worth flagging about one state, most severe first. */
export function stateIssues(
  name: string,
  machine: MachineProps,
  clips: string[],
  stateFiles: string[],
): StateIssue[] {
  const issues: StateIssue[] = []
  const def = machine.states[name]
  const clip = def?.clip ?? name
  if (!clips.includes(clip)) {
    issues.push({
      level: 'warn',
      text: 'No animation for this state',
      detail:
        `This character's sprite has no clip named "${clip}". When the state starts, ` +
        `the current animation just keeps playing. Create a "${clip}" clip in the ` +
        `Animation editor, or pick another clip for this state.`,
    })
  }
  for (const edge of def?.transitions ?? []) {
    if (edge.to !== '*' && !machine.states[edge.to]) {
      issues.push({
        level: 'warn',
        text: `Goes to "${edge.to}", which doesn't exist`,
        detail:
          `This state has a transition to "${edge.to}", but no state has that name. ` +
          `The transition will never happen. Rename the target or create that state.`,
      })
    }
  }
  const initial = machine.initial || stateNames(machine)[0]
  if (name !== initial) {
    const reachable = Object.values(machine.states).some((s) =>
      (s.transitions ?? []).some((t) => t.to === name),
    )
    if (!reachable) {
      issues.push({
        level: 'warn',
        text: 'Nothing leads here',
        detail:
          `No transition targets "${name}" and it isn't the initial state, so it can ` +
          `never run. Open the state it should start from and add a transition to ` +
          `"${name}" there. (If your code jumps here with fsm.goto, ignore this.)`,
      })
    }
  }
  const code = stateCodeStatus(machine.role, name, stateFiles)
  if (code.kind === 'none') {
    issues.push({
      level: 'info',
      text: 'No code for this state yet',
      detail:
        `No file src/states/${name}.ts and nothing registered for "${name}" in the ` +
        `"${machine.role}" role. The state still animates and switches by its data — ` +
        `press "Create code file" to give it behavior.`,
    })
  }
  return issues
}

/** True when the role's state code is compiled into the editor. */
export function roleKnown(role: string): boolean {
  return role !== '' && logicSet(role) !== undefined
}

/** The generated starter for a state's code file — it works as created. */
export function stateFileTemplate(role: string, state: string): string {
  if (role === 'player') {
    return `import { defineStates } from '@waica/engine'
import { PlatformerMotor } from '@waica/behaviors'

// Code for the "${state}" state — generated by waica.
// When it starts, when it ends and which clip it plays live in the
// prefab's State Machine data. While in it, the body keeps the role's
// stock update (running, gravity, collisions, land/fall signals), so
// this file only says what makes "${state}" special.
defineStates('${role}', {
  ${state}: {
    onEnter({ entity }) {
      const motor = entity.get(PlatformerMotor)
      if (!motor) return
      // One burst in the facing direction — replace with your state's idea.
      motor.vx = motor.facing * 30
    },
  },
})
`
  }
  return `import { defineStates } from '@waica/engine'

// Code for the "${state}" state — generated by waica.
// When it starts and when it ends live in the prefab's State Machine
// data; this file is only the behavior. Hooks receive { entity, game, fsm }.
defineStates('${role}', {
  ${state}: {
    onEnter({ entity }) {
      console.log(\`\${entity.name} entered "${state}"\`)
    },
  },
})
`
}

/**
 * The generated starter for a custom role — the level-3 exit. It registers
 * in the shipped game on import; the editor lists project roles once TS
 * hot reload lands, so until then the Role dropdown picks it by name.
 */
export function roleFileTemplate(role: string): string {
  return `import { defineRole } from '@waica/engine'

// The "${role}" role — generated by waica.
// A role is a character's whole behavior package: a plain-language
// description for the editor, the driver component its states move,
// the starter state graph, and the state code itself.
defineRole('${role}', {
  description: 'Describe what a ${role} does — shown when picking roles.',
  // driver: 'PlatformerMotor', // uncomment if the states move a driver component
  graph: {
    initial: 'idle',
    states: { idle: { transitions: [] } },
  },
  states: {
    idle: {
      onUpdate({ entity, game, fsm }, dt) {
        // Runs every frame while a "${role}" is in its "idle" state.
      },
    },
  },
})
`
}
