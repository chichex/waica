import { useState, type ReactNode } from 'react'
import { roleDefinition, type SceneComponentJson } from '@waica/engine'
import {
  machineProps,
  removeState,
  roleKnown,
  stateIssues,
  stateNames,
  type MachineProps,
} from '../project/states'
import { RESERVED_STATE_NAMES } from './state-draft'

// The modals the card opens live in their own modules; they stay importable
// from here, where the editor has always found them.
export { StateEditorModal } from './StateEditorModal'
export { RolePickerModal, type NewCharacterPick } from './RolePickerModal'

/** Whose StateMachine a state edit applies to (mirrors AnimTarget). */
export type StateTarget =
  | { kind: 'prefab'; ref: string; state: string }
  | { kind: 'entity'; name: string; state: string }

interface StateMachineCardProps {
  comp: SceneComponentJson
  /** Clip names on the sibling AnimatedSprite, for the warnings. */
  clips: string[]
  /** Basenames in src/states/, for the code ⓘ. */
  stateFiles: string[]
  /** Basenames in src/roles/, for the custom-role status. */
  roleFiles: string[]
  onPatch: (patch: Partial<MachineProps>) => void
  onCreateRoleFile: (role: string) => void
  onEditState: (state: string) => void
  /** Absent = locked (prefab-owned at the entity level). */
  onRemove?: () => void
  /** Read-only effective component update position supplied by the Inspector. */
  updateSchedule?: ReactNode
}

/**
 * The inspector card for a character's Role — its behavior package. The
 * role is fixed at birth (picked in the creation dialog); changing it
 * means deleting the character and creating a new one, so the card only
 * shows it. Initial state and the state list with its warnings are the
 * role's visible detail. Structure edits (add/delete) go through onPatch;
 * each state's detail opens the StateEditorModal.
 */
export function StateMachineCard({
  comp, clips, stateFiles, roleFiles, onPatch, onCreateRoleFile, onEditState, onRemove,
  updateSchedule,
}: StateMachineCardProps) {
  const machine = machineProps(comp)

  const addState = (name: string): void => {
    onPatch({
      states: { ...machine.states, [name]: { transitions: [] } },
      ...(machine.initial ? {} : { initial: name }),
    })
    onEditState(name)
  }

  const deleteState = (name: string): void => {
    if (!window.confirm(`Delete state "${name}"?`)) return
    const states = removeState(machine.states, name)
    const patch: Partial<MachineProps> = { states }
    if (machine.initial === name) {
      patch.initial = Object.keys(states).find((n) => n !== '*') ?? ''
    }
    onPatch(patch)
  }

  return (
    <div className="ed-comp">
      <header
        className="ed-comp-head"
        title={onRemove ? undefined : 'defined by the prefab — edit the prefab to change it'}
      >
        <span>Role</span>
        {updateSchedule}
        {onRemove && (
          <button className="ed-mini" title="Remove component" onClick={onRemove}>
            ✕
          </button>
        )}
      </header>
      <RoleSummary role={machine.role} roleFiles={roleFiles} onCreateRoleFile={onCreateRoleFile} />
      <InitialStateField machine={machine} onChange={(initial) => onPatch({ initial })} />
      <StateList
        machine={machine}
        clips={clips}
        stateFiles={stateFiles}
        onEditState={onEditState}
        onDeleteState={deleteState}
      />
      <AddStateField machine={machine} onAdd={addState} />
    </div>
  )
}

/** The state the machine starts in; '' (unset) starts in the first state. */
function InitialStateField({
  machine,
  onChange,
}: {
  machine: MachineProps
  onChange: (initial: string) => void
}) {
  return (
    <label className="ed-row">
      <span>initial</span>
      <select value={machine.initial} onChange={(e) => onChange(e.target.value)}>
        {machine.initial === '' && <option value="">(first state)</option>}
        {stateNames(machine).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

interface RoleSummaryProps {
  role: string
  roleFiles: string[]
  onCreateRoleFile: (role: string) => void
}

/** The role fixed at birth, what it does, and — for a role the editor lacks — its project file. */
function RoleSummary({ role, roleFiles, onCreateRoleFile }: RoleSummaryProps) {
  const def = roleDefinition(role)
  return (
    <>
      <div className="ed-row">
        <span>role</span>
        <span
          className="ed-role-fixed"
          title="picked at birth — to change it, delete this character and create a new one"
        >
          {role || '(none)'}
        </span>
      </div>
      {def && <div className="ed-hint">{def.description}</div>}
      {!roleKnown(role) && role && (
        roleFiles.includes(`${role}.ts`) ? (
          <div className="ed-hint">
            ⓘ Role file found: src/roles/{role}.ts — it registers when you press
            Play and when your game runs (pnpm dev)
          </div>
        ) : (
          <>
            <div className="ed-hint">
              ⓘ "{role}" is not a role the editor knows — define it in your project
              (defineRole) and it works in the shipped game:
            </div>
            <button className="ed-wide" onClick={() => onCreateRoleFile(role)}>
              ✚ Create role file — src/roles/{role}.ts
            </button>
          </>
        )
      )}
    </>
  )
}

interface StateListProps {
  machine: MachineProps
  clips: string[]
  stateFiles: string[]
  onEditState: (state: string) => void
  onDeleteState: (state: string) => void
}

/** One row per state: open it, its warnings (⚠/ⓘ with the full explanation), delete it. */
function StateList({ machine, clips, stateFiles, onEditState, onDeleteState }: StateListProps) {
  const names = stateNames(machine)
  return (
    <div className="ed-sm-states">
      {names.length === 0 && <div className="ed-hint">no states yet — add the first one</div>}
      {names.map((name) => (
        <div className="ed-sm-state" key={name}>
          <button
            className="ed-sm-name"
            title="Edit this state (clip, transitions, code)"
            onClick={() => onEditState(name)}
          >
            {name}
          </button>
          {stateIssues(name, machine, clips, stateFiles).map((issue) => (
            <span
              key={issue.text}
              className={`ed-sm-issue ${issue.level === 'warn' ? 'is-warn' : ''}`}
              title={issue.detail}
            >
              {issue.level === 'warn' ? '⚠' : 'ⓘ'}
            </span>
          ))}
          <button className="ed-mini" title="Delete this state" onClick={() => onDeleteState(name)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/** The new-state field: refuses taken and reserved names, and clears once a state is added. */
function AddStateField({ machine, onAdd }: { machine: MachineProps; onAdd: (name: string) => void }) {
  const [newState, setNewState] = useState('')
  const addName = newState.trim()
  const addTaken =
    addName !== '' && (RESERVED_STATE_NAMES.has(addName) || machine.states[addName] !== undefined)
  const add = (): void => {
    if (!addName || addTaken) return
    onAdd(addName)
    setNewState('')
  }

  return (
    <>
      <div className="ed-stat-add">
        <input
          type="text"
          placeholder="new state name…"
          value={newState}
          onChange={(e) => setNewState(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="ed-mini" disabled={!addName || addTaken} onClick={add}>
          add
        </button>
      </div>
      {addTaken && <div className="ed-hint ed-warn">a state named “{addName}” already exists</div>}
    </>
  )
}
