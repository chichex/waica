import { useState } from 'react'
import type { StateJson } from '@waica/engine'
import { stateCodeStatus, type MachineProps, type StateCodeStatus } from '../project/states'
import { MissingOption, missingOptionClass } from './missing-option'
import { ModalBackdrop } from './ModalBackdrop'
import { applyStateDraft, parseEdge, RESERVED_STATE_NAMES, type EdgeDraft } from './state-draft'
import { TransitionsSection } from './StateTransitionsEditor'
import { useEscapeKey } from './use-escape-key'

interface StateEditorModalProps {
  /** Shown in the header: the prefab ref or entity name being edited. */
  title: string
  machine: MachineProps
  state: string
  clips: string[]
  /** Action names from src/controls.json, for the input trigger picker. */
  inputActions: string[]
  stateFiles: string[]
  onCreateFile: (state: string) => void
  onSave: (patch: { states: Record<string, StateJson>; initial: string }) => void
  onCancel: () => void
}

/**
 * Modal editor for one state: rename, clip override, transitions with
 * dropdowns (no syntax to remember) and the code status with one-click
 * scaffolding into src/states/.
 */
export function StateEditorModal({
  title, machine, state, clips, inputActions, stateFiles, onCreateFile, onSave, onCancel,
}: StateEditorModalProps) {
  const def = machine.states[state] ?? {}
  const [name, setName] = useState(state)
  const [clip, setClip] = useState(def.clip ?? '')
  const [edges, setEdges] = useState<EdgeDraft[]>((def.transitions ?? []).map(parseEdge))
  useEscapeKey(onCancel)

  const nextName = name.trim() || state
  const renameTaken =
    nextName !== state &&
    (RESERVED_STATE_NAMES.has(nextName) || machine.states[nextName] !== undefined)

  const save = (): void => {
    if (renameTaken) return
    onSave(applyStateDraft(machine, { state, nextName, clip, edges }))
  }

  return (
    <ModalBackdrop onDismiss={onCancel}>
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
          <StateNameField name={name} nextName={nextName} renameTaken={renameTaken} onChange={setName} />
          <StateAnimationField clip={clip} clips={clips} nextName={nextName} onChange={setClip} />
          <TransitionsSection
            machine={machine}
            state={state}
            nextName={nextName}
            edges={edges}
            setEdges={setEdges}
            inputActions={inputActions}
          />
          <StateCodeSection
            role={machine.role}
            code={stateCodeStatus(machine.role, nextName, stateFiles)}
            nextName={nextName}
            onCreateFile={onCreateFile}
          />
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
    </ModalBackdrop>
  )
}

interface StateNameFieldProps {
  name: string
  nextName: string
  /** The trimmed name is reserved or another state's. */
  renameTaken: boolean
  onChange: (name: string) => void
}

/** The state's name, with why a rename onto it cannot be saved. */
function StateNameField({ name, nextName, renameTaken, onChange }: StateNameFieldProps) {
  return (
    <>
      <label className="ed-row">
        <span>name</span>
        <input type="text" value={name} onChange={(e) => onChange(e.target.value)} />
      </label>
      {renameTaken && (
        <div className="ed-hint ed-warn">
          {RESERVED_STATE_NAMES.has(nextName)
            ? `“${nextName}” is reserved for the role's own hooks`
            : `a state named “${nextName}” already exists`}
        </div>
      )}
    </>
  )
}

interface StateAnimationFieldProps {
  clip: string
  clips: string[]
  nextName: string
  onChange: (clip: string) => void
}

/** The state's clip override (empty = the clip named like the state), with the no-animation warning. */
function StateAnimationField({ clip, clips, nextName, onChange }: StateAnimationFieldProps) {
  const clipMissing = clip !== '' && !clips.includes(clip)
  return (
    <>
      <label className="ed-row">
        <span>animation</span>
        <select
          className={missingOptionClass(clipMissing)}
          value={clip}
          onChange={(e) => onChange(e.target.value)}
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
    </>
  )
}

interface StateCodeSectionProps {
  role: string
  code: StateCodeStatus
  nextName: string
  onCreateFile: (state: string) => void
}

/** Where the state's code comes from, with one-click scaffolding when it has none. */
function StateCodeSection({ role, code, nextName, onCreateFile }: StateCodeSectionProps) {
  return (
    <>
      <header className="ed-sec-head">Code</header>
      {code.kind === 'builtin' ? (
        <div className="ed-hint">✓ Built into the “{role}” role — runs in editor Play and in your game</div>
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
    </>
  )
}
