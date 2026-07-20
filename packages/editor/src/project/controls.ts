import { DEFAULT_BINDINGS, type InputBindings } from '@waica/engine'

/**
 * Project controls: which keys fire each input action. Persisted as
 * src/controls.json so the shipped game and play-in-editor read the
 * same file; missing or broken files fall back to the engine defaults.
 */

export const CONTROLS_PATH = 'src/controls.json'

export interface ControlsJson {
  waicaControls: 1
  bindings: InputBindings
}

/** Friendly action names shown by the controls inspector. */
export const ACTION_LABELS: Record<string, string> = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
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

/** Friendly name for a KeyboardEvent.code ("KeyA" → "A", "ArrowLeft" → "←"). */
export function keyLabel(code: string): string {
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
 * Bindings from a controls.json file's text, merged over the engine
 * defaults. Tolerant: missing file, bad JSON or junk entries all
 * degrade to the defaults.
 */
export function parseControls(text: string | null): InputBindings {
  const bindings = structuredClone(DEFAULT_BINDINGS) as InputBindings
  if (!text) return bindings
  try {
    const json = JSON.parse(text) as Partial<ControlsJson>
    for (const [action, codes] of Object.entries(json.bindings ?? {})) {
      if (isCodeList(codes)) bindings[action] = codes
    }
  } catch {
    // hand-edited into invalid JSON: the defaults keep the game playable
  }
  return bindings
}

export function serializeControls(bindings: InputBindings): string {
  const json: ControlsJson = { waicaControls: 1, bindings }
  return JSON.stringify(json, null, 2) + '\n'
}
