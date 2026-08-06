import { useEffect, useState } from 'react'
import {
  registeredRoles,
  roleDefinition,
  type SceneComponentJson,
  type StateJson,
  type StateTransitionJson,
} from '@waica/engine'
import {
  machineProps,
  roleKnown,
  stateCodeStatus,
  stateIssues,
  stateNames,
  type MachineProps,
} from '../project/states'
import type { CharacterIdentity } from '../project/chassis'
import { MissingOption, missingOptionClass } from './missing-option'

/** Whose StateMachine a state edit applies to (mirrors AnimTarget). */
export type StateTarget =
  | { kind: 'prefab'; ref: string; state: string }
  | { kind: 'entity'; name: string; state: string }

/**
 * The inspector card for a character's Role — its behavior package. The
 * role is fixed at birth (picked in the creation dialog); changing it
 * means deleting the character and creating a new one, so the card only
 * shows it. Initial state and the state list with its warnings are the
 * role's visible detail. Structure edits (add/delete) go through onPatch;
 * each state's detail opens the StateEditorModal.
 */
export function StateMachineCard({
  comp,
  clips,
  stateFiles,
  roleFiles,
  onPatch,
  onCreateRoleFile,
  onEditState,
  onRemove,
}: {
  comp: SceneComponentJson
  /** Clip names on the sibling AnimatedSprite, for the warnings. */
  clips: string[]
  /** Basenames in src/states/, for the code ⓘ. */
  stateFiles: string[]
  /** Basenames in src/roles/, for the custom-role status. */
  roleFiles: string[]
  onPatch(patch: Partial<MachineProps>): void
  onCreateRoleFile(role: string): void
  onEditState(state: string): void
  /** Absent = locked (prefab-owned at the entity level). */
  onRemove?(): void
}) {
  const machine = machineProps(comp)
  const names = stateNames(machine)
  const known = roleKnown(machine.role)
  const def = roleDefinition(machine.role)
  const roleFile = roleFiles.includes(`${machine.role}.ts`)
  const [newState, setNewState] = useState('')

  const addName = newState.trim()
  const addTaken =
    addName !== '' && (RESERVED_STATE_NAMES.has(addName) || machine.states[addName] !== undefined)
  const addState = (): void => {
    if (!addName || addTaken) return
    onPatch({
      states: { ...machine.states, [addName]: { transitions: [] } },
      ...(machine.initial ? {} : { initial: addName }),
    })
    setNewState('')
    onEditState(addName)
  }

  const deleteState = (name: string): void => {
    if (!window.confirm(`Delete state "${name}"?`)) return
    const states = { ...machine.states }
    delete states[name]
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
        {onRemove && (
          <button className="ed-mini" title="Remove component" onClick={onRemove}>
            ✕
          </button>
        )}
      </header>

      <div className="ed-row">
        <span>role</span>
        <span
          className="ed-role-fixed"
          title="picked at birth — to change it, delete this character and create a new one"
        >
          {machine.role || '(none)'}
        </span>
      </div>
      {def && <div className="ed-hint">{def.description}</div>}
      {!known && machine.role && (
        roleFile ? (
          <div className="ed-hint">
            ⓘ Role file found: src/roles/{machine.role}.ts — it registers when you press
            Play and when your game runs (pnpm dev)
          </div>
        ) : (
          <>
            <div className="ed-hint">
              ⓘ "{machine.role}" is not a role the editor knows — define it in your project
              (defineRole) and it works in the shipped game:
            </div>
            <button className="ed-wide" onClick={() => onCreateRoleFile(machine.role)}>
              ✚ Create role file — src/roles/{machine.role}.ts
            </button>
          </>
        )
      )}

      <label className="ed-row">
        <span>initial</span>
        <select value={machine.initial} onChange={(e) => onPatch({ initial: e.target.value })}>
          {machine.initial === '' && <option value="">(first state)</option>}
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <div className="ed-sm-states">
        {names.length === 0 && <div className="ed-hint">no states yet — add the first one</div>}
        {names.map((name) => {
          const issues = stateIssues(name, machine, clips, stateFiles)
          return (
            <div className="ed-sm-state" key={name}>
              <button
                className="ed-sm-name"
                title="Edit this state (clip, transitions, code)"
                onClick={() => onEditState(name)}
              >
                {name}
              </button>
              {issues.map((issue) => (
                <span
                  key={issue.text}
                  className={`ed-sm-issue ${issue.level === 'warn' ? 'is-warn' : ''}`}
                  title={issue.detail}
                >
                  {issue.level === 'warn' ? '⚠' : 'ⓘ'}
                </span>
              ))}
              <button className="ed-mini" title="Delete this state" onClick={() => deleteState(name)}>
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <div className="ed-stat-add">
        <input
          type="text"
          placeholder="new state name…"
          value={newState}
          onChange={(e) => setNewState(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addState()
          }}
        />
        <button className="ed-mini" disabled={!addName || addTaken} onClick={addState}>
          add
        </button>
      </div>
      {addTaken && <div className="ed-hint ed-warn">a state named “{addName}” already exists</div>}
    </div>
  )
}

/** One transition row being edited, as friendly parts of 'kind:arg → to'. */
interface EdgeDraft {
  kind: 'input' | 'timer' | 'signal'
  arg: string
  to: string
}

function parseEdge(t: StateTransitionJson): EdgeDraft {
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
function describeTrigger(on: string): string {
  const e = parseEdge({ on, to: '' })
  if (e.kind === 'input') return `key press ${e.arg}`
  if (e.kind === 'timer') return `after ${e.arg}s`
  return `signal ${e.arg}`
}

/** States may not take the names the logic set reserves for its hooks. */
const RESERVED_STATE_NAMES = new Set(['*', 'default'])

/** Placeholder per trigger kind, so an empty arg reads as instructions. */
const ARG_HINTS: Record<EdgeDraft['kind'], string> = {
  input: 'action…',
  timer: 'seconds…',
  signal: 'signal name…',
}

/**
 * Modal editor for one state: rename, clip override, transitions with
 * dropdowns (no syntax to remember) and the code status with one-click
 * scaffolding into src/states/.
 */
export function StateEditorModal({
  title,
  machine,
  state,
  clips,
  inputActions,
  stateFiles,
  onCreateFile,
  onSave,
  onCancel,
}: {
  /** Shown in the header: the prefab ref or entity name being edited. */
  title: string
  machine: MachineProps
  state: string
  clips: string[]
  /** Action names from src/controls.json, for the input trigger picker. */
  inputActions: string[]
  stateFiles: string[]
  onCreateFile(state: string): void
  onSave(patch: { states: Record<string, StateJson>; initial: string }): void
  onCancel(): void
}) {
  const def = machine.states[state] ?? {}
  const [name, setName] = useState(state)
  const [clip, setClip] = useState(def.clip ?? '')
  const [edges, setEdges] = useState<EdgeDraft[]>((def.transitions ?? []).map(parseEdge))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const nextName = name.trim() || state
  const clipMissing = clip !== '' && !clips.includes(clip)
  const renameTaken =
    nextName !== state &&
    (RESERVED_STATE_NAMES.has(nextName) || machine.states[nextName] !== undefined)
  const targets = stateNames(machine).map((n) => (n === state ? nextName : n))
  const code = stateCodeStatus(machine.role, nextName, stateFiles)
  /** Signals the role's code emits — suggestions for the signal trigger field. */
  const signals = Object.entries(roleDefinition(machine.role)?.signals ?? {})
  /** Edges of other states that lead here — the half of the map this modal doesn't edit. */
  const incoming = Object.entries(machine.states).flatMap(([from, d]) =>
    (d.transitions ?? [])
      .filter((t) => t.to === state)
      .map((t) => `${from === '*' ? 'any state' : from} (${describeTrigger(t.on)})`),
  )

  const patchEdge = (index: number, patch: Partial<EdgeDraft>): void =>
    setEdges((all) => all.map((e, i) => (i === index ? { ...e, ...patch } : e)))

  const save = (): void => {
    if (renameTaken) return
    const renamed: StateJson = {
      ...(clip ? { clip } : {}),
      transitions: edges.map(serializeEdge).map((t) => (t.to === state ? { ...t, to: nextName } : t)),
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
    onSave({ states, initial })
  }

  return (
    <div
      className="ed-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="ed-modal ed-modal-state">
        <header className="ed-modal-head">
          <span>
            State “{state}” — {title}
          </span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="ed-modal-body ed-sm-body">
          <label className="ed-row">
            <span>name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {renameTaken && (
            <div className="ed-hint ed-warn">
              {RESERVED_STATE_NAMES.has(nextName)
                ? `“${nextName}” is reserved for the role's own hooks`
                : `a state named “${nextName}” already exists`}
            </div>
          )}

          <label className="ed-row">
            <span>animation</span>
            <select
              className={missingOptionClass(clipMissing)}
              value={clip}
              onChange={(e) => setClip(e.target.value)}
            >
              <option value="">
                {clips.includes(nextName) ? `same name (${nextName})` : `same name (${nextName}) — missing`}
              </option>
              {clipMissing && <MissingOption value={clip} />}
              {clips.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {!clips.includes(clip || nextName) && (
            <div className="ed-hint ed-warn">
              ⚠ No animation for this state — when it starts, the current animation keeps
              playing. Create a “{clip || nextName}” clip in the Animation editor, or pick one
              above.
            </div>
          )}

          <header className="ed-sec-head">Transitions</header>
          {incoming.length > 0 ? (
            <div className="ed-hint">⬅ reached from {incoming.join(', ')}</div>
          ) : machine.initial === state ? (
            <div className="ed-hint">⬅ the initial state — the machine starts here</div>
          ) : (
            <div className="ed-hint ed-warn">
              ⚠ Nothing leads here yet — open the state this one starts from and add a
              transition to “{state}” there
            </div>
          )}
          {edges.length === 0 && (
            <div className="ed-hint">no transitions — this state never leaves by itself</div>
          )}
          {edges.map((edge, i) => (
            <div className="ed-sm-edge" key={i}>
              <select
                value={edge.kind}
                onChange={(e) => patchEdge(i, { kind: e.target.value as EdgeDraft['kind'], arg: '' })}
              >
                <option value="input">key press</option>
                <option value="timer">after (s)</option>
                <option value="signal">signal</option>
              </select>
              {edge.kind === 'input' ? (
                <select value={edge.arg} onChange={(e) => patchEdge(i, { arg: e.target.value })}>
                  {edge.arg === '' && <option value="">action…</option>}
                  {!inputActions.includes(edge.arg) && edge.arg !== '' && (
                    <option value={edge.arg}>{edge.arg}</option>
                  )}
                  {inputActions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              ) : edge.kind === 'timer' ? (
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={edge.arg}
                  placeholder={ARG_HINTS.timer}
                  onChange={(e) => patchEdge(i, { arg: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  list={signals.length > 0 ? 'ed-sm-signals' : undefined}
                  value={edge.arg}
                  placeholder={ARG_HINTS.signal}
                  onChange={(e) => patchEdge(i, { arg: e.target.value })}
                />
              )}
              <span className="ed-sm-arrow">→</span>
              <select
                className={targets.includes(edge.to) ? '' : 'is-broken'}
                value={edge.to}
                onChange={(e) => patchEdge(i, { to: e.target.value })}
              >
                {!targets.includes(edge.to) && (
                  <option value={edge.to}>{edge.to || 'state…'} ⚠</option>
                )}
                {targets.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className="ed-mini"
                title="Remove this transition"
                onClick={() => setEdges((all) => all.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="ed-mini"
            onClick={() =>
              setEdges((all) => [...all, { kind: 'signal', arg: '', to: targets[0] ?? '' }])
            }
          >
            + transition
          </button>
          {signals.length > 0 && (
            // The signal field suggests the role's declared vocabulary but
            // stays free text: project code can emit signals of its own.
            <datalist id="ed-sm-signals">
              {signals.map(([signal, description]) => (
                <option key={signal} value={signal}>
                  {description}
                </option>
              ))}
            </datalist>
          )}

          <header className="ed-sec-head">Code</header>
          {code.kind === 'builtin' ? (
            <div className="ed-hint">
              ✓ Built into the “{machine.role}” role — runs in editor Play and in your game
            </div>
          ) : code.kind === 'file' ? (
            <div className="ed-hint">
              ✓ Code file: {code.path} — loaded fresh on every Play, and in your game (pnpm
              dev)
            </div>
          ) : (
            <>
              <div className="ed-hint">
                ⓘ No code yet — the state still animates and switches by its data. Give it
                behavior with a code file in your project:
              </div>
              <button className="ed-wide" onClick={() => onCreateFile(nextName)}>
                ✚ Create code file — src/states/{nextName}.ts
              </button>
            </>
          )}
        </div>

        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onCancel}>
            Cancel
          </button>
          <button className="ed-primary" disabled={renameTaken} onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

/** What the creation dialog hands back: who it is, and the role package. */
export interface NewCharacterPick {
  identity: CharacterIdentity
  role: string
}

/** Roles offered as an enemy's hunting style — every role that isn't an identity of its own. */
function enemyRoles(): string[] {
  return registeredRoles().filter((name) => name !== 'player' && name !== 'npc')
}

/**
 * Modal shown when creating a character: pick WHO it is (player / enemy /
 * npc / custom) there and then, so the character is born whole — graph,
 * driver and the identity's extras installed (player → Respawn, enemy →
 * Hazard), working in Play from second zero. Enemies also pick how they
 * hunt: a built-in movement role or a custom one from the project's code;
 * 'custom' is bring-your-own-role with no extras at all. The identity is
 * fixed at birth: changing it later means deleting the character and
 * creating a new one.
 */
export function RolePickerModal({
  suggested,
  onPick,
  onCancel,
}: {
  /** Preselected identity: 'player' until the project has one, then 'enemy'. */
  suggested: CharacterIdentity
  onPick(pick: NewCharacterPick): void
  onCancel(): void
}) {
  const [identity, setIdentity] = useState<CharacterIdentity>(suggested)
  /** The enemy's movement role; null = custom (named below). */
  const [movement, setMovement] = useState<string | null>(enemyRoles()[0] ?? null)
  const [customRole, setCustomRole] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const role =
    identity === 'player'
      ? 'player'
      : identity === 'npc'
        ? 'npc'
        : identity === 'enemy'
          ? (movement ?? customRole.trim())
          : customRole.trim()
  const ready = role !== ''

  const identityOption = (id: CharacterIdentity, desc: string): React.ReactNode => (
    <label className={`ed-role-option ${identity === id ? 'is-picked' : ''}`}>
      <input type="radio" name="identity" checked={identity === id} onChange={() => setIdentity(id)} />
      <span className="ed-role-name">{id}</span>
      <span className="ed-role-desc">{desc}</span>
    </label>
  )

  return (
    <div
      className="ed-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="ed-modal ed-modal-role">
        <header className="ed-modal-head">
          <span>New character — what is it?</span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>
        <div className="ed-modal-body ed-role-body">
          {identityOption(
            'player',
            `${roleDefinition('player')?.description ?? ''} Respawn included — it comes back at its spawn point when it dies.`,
          )}
          {identityOption(
            'enemy',
            'Hurts the player on touch — Hazard included. Pick how it hunts:',
          )}
          {identity === 'enemy' && (
            <div className="ed-role-sub">
              {enemyRoles().map((name) => (
                <label
                  key={name}
                  className={`ed-role-option ${movement === name ? 'is-picked' : ''}`}
                >
                  <input
                    type="radio"
                    name="enemy-role"
                    checked={movement === name}
                    onChange={() => setMovement(name)}
                  />
                  <span className="ed-role-name">{name}</span>
                  <span className="ed-role-desc">{roleDefinition(name)?.description}</span>
                </label>
              ))}
              <label className={`ed-role-option ${movement === null ? 'is-picked' : ''}`}>
                <input
                  type="radio"
                  name="enemy-role"
                  checked={movement === null}
                  onChange={() => setMovement(null)}
                />
                <span className="ed-role-name">custom</span>
                {movement === null ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="your role name…"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                  />
                ) : (
                  <span className="ed-role-desc">
                    a role of your own — name it here, define it in your project (defineRole)
                  </span>
                )}
              </label>
            </div>
          )}
          {identityOption('npc', roleDefinition('npc')?.description ?? '')}
          <label className={`ed-role-option ${identity === 'custom' ? 'is-picked' : ''}`}>
            <input
              type="radio"
              name="identity"
              checked={identity === 'custom'}
              onChange={() => setIdentity('custom')}
            />
            <span className="ed-role-name">custom</span>
            {identity === 'custom' ? (
              <input
                type="text"
                autoFocus
                placeholder="your role name…"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
              />
            ) : (
              <span className="ed-role-desc">
                a role of your own, no extras included — name it here, define it in your
                project (defineRole)
              </span>
            )}
          </label>
          <div className="ed-hint">
            the choice installs the whole package — states, the behaviour that moves them and
            the identity's extras — and is fixed at birth: to change it later, delete the
            character and create a new one.
          </div>
        </div>
        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="ed-primary"
            disabled={!ready}
            onClick={() => onPick({ identity, role })}
          >
            Create
          </button>
        </footer>
      </div>
    </div>
  )
}
