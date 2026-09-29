import { roleDefinition } from '@waica/engine'
import { stateNames, type MachineProps } from '../project/states'
import { ARG_HINTS, describeTrigger, type EdgeDraft } from './state-draft'

// The Transitions section of the StateEditorModal: how the state is reached
// and the 'trigger → target' rows that leave it, edited with pickers so no
// 'kind:arg' syntax has to be remembered.

interface TransitionsSectionProps {
  machine: MachineProps
  state: string
  nextName: string
  edges: EdgeDraft[]
  setEdges: (update: (all: EdgeDraft[]) => EdgeDraft[]) => void
  inputActions: string[]
}

/** How the state is reached (read-only) and the transitions that leave it (edited). */
export function TransitionsSection({
  machine, state, nextName, edges, setEdges, inputActions,
}: TransitionsSectionProps) {
  const targets = stateNames(machine).map((n) => (n === state ? nextName : n))
  /** Signals the role's code emits — suggestions for the signal trigger field. */
  const signals = Object.entries(roleDefinition(machine.role)?.signals ?? {})
  const patchEdge = (index: number, patch: Partial<EdgeDraft>): void =>
    setEdges((all) => all.map((e, i) => (i === index ? { ...e, ...patch } : e)))

  return (
    <>
      <header className="ed-sec-head">Transitions</header>
      <IncomingEdges machine={machine} state={state} />
      {edges.length === 0 && (
        <div className="ed-hint">no transitions — this state never leaves by itself</div>
      )}
      {edges.map((edge, i) => (
        <TransitionRow
          key={i}
          edge={edge}
          targets={targets}
          inputActions={inputActions}
          suggestSignals={signals.length > 0}
          onChange={(patch) => patchEdge(i, patch)}
          onRemove={() => setEdges((all) => all.filter((_, j) => j !== i))}
        />
      ))}
      <button
        className="ed-mini"
        onClick={() => setEdges((all) => [...all, { kind: 'signal', arg: '', to: targets[0] ?? '' }])}
      >
        + transition
      </button>
      {signals.length > 0 && <SignalSuggestions signals={signals} />}
    </>
  )
}

/**
 * The role's declared signals, offered to every signal field. The field
 * stays free text: project code can emit signals of its own.
 */
function SignalSuggestions({ signals }: { signals: [signal: string, description: string][] }) {
  return (
    <datalist id="ed-sm-signals">
      {signals.map(([signal, description]) => (
        <option key={signal} value={signal}>
          {description}
        </option>
      ))}
    </datalist>
  )
}

/** Edges of other states that lead here — the half of the map this modal doesn't edit. */
function IncomingEdges({ machine, state }: { machine: MachineProps; state: string }) {
  const incoming = Object.entries(machine.states).flatMap(([from, d]) =>
    (d.transitions ?? [])
      .filter((t) => t.to === state)
      .map((t) => `${from === '*' ? 'any state' : from} (${describeTrigger(t.on)})`),
  )
  if (incoming.length > 0) return <div className="ed-hint">⬅ reached from {incoming.join(', ')}</div>
  if (machine.initial === state) {
    return <div className="ed-hint">⬅ the initial state — the machine starts here</div>
  }
  return (
    <div className="ed-hint ed-warn">
      ⚠ Nothing leads here yet — open the state this one starts from and add a
      transition to “{state}” there
    </div>
  )
}

interface TransitionRowProps {
  edge: EdgeDraft
  targets: string[]
  inputActions: string[]
  suggestSignals: boolean
  onChange: (patch: Partial<EdgeDraft>) => void
  onRemove: () => void
}

/** One 'trigger → target' row: the trigger kind, its argument, the target state and remove. */
function TransitionRow({
  edge, targets, inputActions, suggestSignals, onChange, onRemove,
}: TransitionRowProps) {
  return (
    <div className="ed-sm-edge">
      <select
        value={edge.kind}
        onChange={(e) => onChange({ kind: e.target.value as EdgeDraft['kind'], arg: '' })}
      >
        <option value="input">key press</option>
        <option value="timer">after (s)</option>
        <option value="signal">signal</option>
      </select>
      <TriggerArgField
        edge={edge}
        inputActions={inputActions}
        suggestSignals={suggestSignals}
        onChange={(arg) => onChange({ arg })}
      />
      <span className="ed-sm-arrow">→</span>
      <select
        className={targets.includes(edge.to) ? '' : 'is-broken'}
        value={edge.to}
        onChange={(e) => onChange({ to: e.target.value })}
      >
        {!targets.includes(edge.to) && <option value={edge.to}>{edge.to || 'state…'} ⚠</option>}
        {targets.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button className="ed-mini" title="Remove this transition" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

interface TriggerArgFieldProps {
  edge: EdgeDraft
  inputActions: string[]
  suggestSignals: boolean
  onChange: (arg: string) => void
}

/** The trigger's argument, in the control its kind needs: an action, seconds or a signal name. */
function TriggerArgField({ edge, inputActions, suggestSignals, onChange }: TriggerArgFieldProps) {
  if (edge.kind === 'input') {
    return (
      <select value={edge.arg} onChange={(e) => onChange(e.target.value)}>
        {edge.arg === '' && <option value="">action…</option>}
        {!inputActions.includes(edge.arg) && edge.arg !== '' && <option value={edge.arg}>{edge.arg}</option>}
        {inputActions.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    )
  }
  if (edge.kind === 'timer') {
    return (
      <input
        type="number"
        min={0}
        step={0.05}
        value={edge.arg}
        placeholder={ARG_HINTS.timer}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <input
      type="text"
      list={suggestSignals ? 'ed-sm-signals' : undefined}
      value={edge.arg}
      placeholder={ARG_HINTS.signal}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
