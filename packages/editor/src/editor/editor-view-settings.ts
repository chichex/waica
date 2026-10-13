// Per-user preferences of the 3D edit view (issue #173 inference 14), kept in
// one localStorage key across projects: whether the helpers are drawn. A
// storage that throws, or holds something else, gives the defaults.
import { useState } from 'react'
import { isJsonObject, readJsonObject } from '../json-object'

const KEY = 'waica:editor:view'

export interface EditorViewSettings {
  /** Draws the scene camera's frustum, the lights' and colliders' helpers (CA-17); the icons stay, they are how a light or the camera is picked. */
  helpers: boolean
}

export const DEFAULT_EDITOR_VIEW: EditorViewSettings = { helpers: true }

export function loadEditorViewSettings(): EditorViewSettings {
  try {
    const text = localStorage.getItem(KEY)
    const raw = text ? readJsonObject(text) : null
    if (!isJsonObject(raw)) return { ...DEFAULT_EDITOR_VIEW }
    return { helpers: typeof raw.helpers === 'boolean' ? raw.helpers : DEFAULT_EDITOR_VIEW.helpers }
  } catch {
    return { ...DEFAULT_EDITOR_VIEW }
  }
}

export function saveEditorViewSettings(settings: EditorViewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable: the preference holds for this session only.
  }
}

/** The per-user 3D view preferences, and a setter for the helpers toggle that also stores it. */
export function useEditorViewSettings(): [EditorViewSettings, (helpers: boolean) => void] {
  const [view, setView] = useState<EditorViewSettings>(loadEditorViewSettings)
  const setHelpers = (helpers: boolean): void => {
    const next = { ...view, helpers }
    setView(next)
    saveEditorViewSettings(next)
  }
  return [view, setHelpers]
}
