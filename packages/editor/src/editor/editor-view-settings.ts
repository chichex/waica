// Per-user preferences of the 3D edit view (issue #173 inference 14), kept in
// one localStorage key across projects: whether the helpers are drawn, and the
// gizmo's snap steps. A storage that throws, or holds something else, gives
// the defaults.
import { useState } from 'react'
import { isJsonObject, readJsonObject } from '../json-object'

const KEY = 'waica:editor:view'

/** The steps a gizmo drag snaps to while Ctrl is held (CA-20): world units, degrees and a scale factor. */
export interface SnapSteps {
  position: number
  rotation: number
  scale: number
}

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/** The 3D gizmo's state (CA-18, CA-20): its mode and space for this session, its snap steps kept per user. */
export interface GizmoSettings {
  mode: GizmoMode
  space: 'world' | 'local'
  snap: SnapSteps
}

export interface EditorViewSettings {
  /** Draws the scene camera's frustum, the lights' and colliders' helpers (CA-17); the icons stay, they are how a light or the camera is picked. */
  helpers: boolean
  snap: SnapSteps
}

export const DEFAULT_EDITOR_VIEW: EditorViewSettings = { helpers: true, snap: { position: 0.5, rotation: 15, scale: 0.1 } }

/** A stored step when it is a number above 0, else the default's. */
function stepOf(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function defaults(): EditorViewSettings {
  return { helpers: DEFAULT_EDITOR_VIEW.helpers, snap: { ...DEFAULT_EDITOR_VIEW.snap } }
}

export function loadEditorViewSettings(): EditorViewSettings {
  try {
    const text = localStorage.getItem(KEY)
    const raw = text ? readJsonObject(text) : null
    if (!isJsonObject(raw)) return defaults()
    const snap = isJsonObject(raw.snap) ? raw.snap : {}
    const fallback = DEFAULT_EDITOR_VIEW.snap
    return {
      helpers: typeof raw.helpers === 'boolean' ? raw.helpers : DEFAULT_EDITOR_VIEW.helpers,
      snap: { position: stepOf(snap.position, fallback.position), rotation: stepOf(snap.rotation, fallback.rotation), scale: stepOf(snap.scale, fallback.scale) },
    }
  } catch {
    return defaults()
  }
}

export function saveEditorViewSettings(settings: EditorViewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable: the preference holds for this session only.
  }
}

/**
 * The 3D edit view's settings: the helpers toggle and the gizmo (its mode and
 * space start as translate in world space; its snap steps are stored per user).
 */
export function useViewport3dSettings() {
  const [view, setView] = useState<EditorViewSettings>(loadEditorViewSettings)
  const [transform, setTransform] = useState<Pick<GizmoSettings, 'mode' | 'space'>>({ mode: 'translate', space: 'world' })
  const store = (next: EditorViewSettings): void => {
    setView(next)
    saveEditorViewSettings(next)
  }
  return {
    helpers: view.helpers,
    gizmo: { ...transform, snap: view.snap },
    setHelpers: (helpers: boolean): void => store({ ...view, helpers }),
    setGizmo: (next: GizmoSettings): void => {
      setTransform({ mode: next.mode, space: next.space })
      if (next.snap !== view.snap) store({ ...view, snap: next.snap })
    },
  }
}

export type Viewport3dSettings = ReturnType<typeof useViewport3dSettings>
