import { DEFAULT_BINDINGS, GAMEPAD_CODE_PREFIX, gamepadControl, type InputBindings } from '@waica/engine'
import { isJsonObject, readJsonObject } from '../json-object'

/**
 * Project controls: which keys fire each input action. Persisted as
 * src/controls.json so the shipped game and play-in-editor read the
 * same file; missing or broken files fall back to the engine defaults.
 */

export const CONTROLS_PATH = 'src/controls.json'

/** How the editor names each action, keyed by action name. */
export type ActionLabels = Record<string, string>

export interface ControlsJson {
  waicaControls: 1
  bindings: InputBindings
  /**
   * The project's own names for its actions. Absent in every project that
   * never named one — the archetype's built-in labels keep coming from its
   * manifest, so this file only ever carries what the project added.
   */
  labels?: ActionLabels
}

/** Bindings plus labels: the whole of what src/controls.json holds. */
export interface ProjectControls {
  bindings: InputBindings
  labels: ActionLabels
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift (right)',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl (right)',
  AltLeft: 'Alt',
  AltRight: 'Alt (right)',
  MetaLeft: 'Cmd',
  MetaRight: 'Cmd (right)',
}

const DIRECTION_ARROWS: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' }

/**
 * Friendly name for a pad code ("Gamepad:A" → "Gamepad A", "Gamepad:DPadUp"
 * → "D-pad ↑", "Gamepad:LeftStickLeft" → "Left stick ←"); undefined for a
 * code the engine does not know, which then shows as written.
 */
function padLabel(code: string): string | undefined {
  const control = gamepadControl(code)
  if (!control) return undefined
  const name = code.slice(GAMEPAD_CODE_PREFIX.length)
  const stick = /^(Left|Right)Stick(Up|Down|Left|Right)?$/.exec(name)
  if (stick) return `${stick[1]} stick ${stick[2] ? DIRECTION_ARROWS[stick[2]] : 'press'}`
  const dpad = /^DPad(Up|Down|Left|Right)$/.exec(name)
  if (dpad) return `D-pad ${DIRECTION_ARROWS[dpad[1] ?? '']}`
  return `Gamepad ${name}`
}

/** Friendly name for a binding code ("KeyA" → "A", "ArrowLeft" → "←", "Gamepad:A" → "Gamepad A"). */
export function keyLabel(code: string): string {
  const pad = padLabel(code)
  if (pad) return pad
  const named = KEY_LABELS[code]
  if (named) return named
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}

function isCodeList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((c) => typeof c === 'string')
}

/**
 * Bindings from controls.json, merged over the resolved archetype defaults.
 * Tolerant: missing files, bad JSON and junk entries keep the game playable.
 */
export function parseControls(
  text: string | null,
  defaults: Readonly<InputBindings> = DEFAULT_BINDINGS,
): InputBindings {
  const bindings = structuredClone(defaults) as InputBindings
  // Hand-edited into invalid JSON or junk: the defaults keep the game playable.
  const declared = text ? readJsonObject(text)?.bindings : undefined
  if (!isJsonObject(declared)) return bindings
  for (const [action, codes] of Object.entries(declared)) {
    if (isCodeList(codes)) bindings[action] = codes
  }
  return bindings
}

/**
 * Action labels from controls.json. As tolerant as parseControls: a missing
 * file, invalid JSON, a labels key that is not an object and non-string
 * entries all mean "no project labels" rather than an unopenable project.
 */
export function parseControlLabels(text: string | null): ActionLabels {
  const labels: ActionLabels = {}
  // Hand-edited into invalid JSON or junk: actions simply render by their raw name.
  const declared = text ? readJsonObject(text)?.labels : undefined
  if (!isJsonObject(declared)) return labels
  for (const [action, label] of Object.entries(declared)) {
    if (typeof label === 'string') labels[action] = label
  }
  return labels
}

/** Writes labels only when there are some, so a project that never named an action keeps its file. */
export function serializeControls(bindings: InputBindings, labels: ActionLabels): string {
  const json: ControlsJson = { waicaControls: 1, bindings }
  if (Object.keys(labels).length > 0) json.labels = labels
  return JSON.stringify(json, null, 2) + '\n'
}

/**
 * What the editor shows for an action: the project's name for it wins over
 * the archetype's, and an action nobody named shows as itself.
 */
export function actionLabel(
  action: string,
  projectLabels: ActionLabels,
  archetypeLabels: Readonly<Record<string, string>>,
): string {
  return projectLabels[action] ?? archetypeLabels[action] ?? action
}

/** Label a new action is born with: 'shoot' → 'Shoot', 'double-jump' → 'Double jump'. */
export function deriveActionLabel(action: string): string {
  const words = action
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const [first, ...rest] = words
  // A name with no letters or digits at all stays exactly as typed.
  if (!first) return action
  return [
    (first[0] ?? '').toUpperCase() + first.slice(1).toLowerCase(),
    ...rest.map((word) => word.toLowerCase()),
  ].join(' ')
}
