/**
 * Per-project editor settings: preferences of the editing experience that
 * ship with the project but never with the game — today, the viewport grid.
 * Persisted as src/editor.json; missing or broken files degrade to the
 * defaults, like every other project config.
 */

export const EDITOR_SETTINGS_PATH = 'src/editor.json'

/** 'isometric' joins this union when the iso archetype lands (H5). */
export type GridType = 'square'

/** Grids finer than this are visual noise and explode the line count. */
export const MIN_GRID_SIZE = 0.05

export interface GridSettings {
  type: GridType
  /** Draws the grid overlay in the edit viewport. */
  show: boolean
  /** Snaps drags/drops to the grid; holding Shift inverts it. */
  snap: boolean
  /** Cell size in world units. */
  size: number
}

export interface EditorSettings {
  grid: GridSettings
}

export interface EditorSettingsJson extends EditorSettings {
  waicaEditor: 1
}

/** snap off + size 0.5 preserves the pre-grid feel: free drags, Shift snaps to 0.5. */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  grid: { type: 'square', show: true, snap: false, size: 0.5 },
}

/**
 * Settings from an editor.json file's text, merged over the defaults.
 * Tolerant: missing file, bad JSON or junk entries all degrade to defaults.
 */
export function parseEditorSettings(text: string | null): EditorSettings {
  const settings = structuredClone(DEFAULT_EDITOR_SETTINGS)
  if (!text) return settings
  try {
    const json = JSON.parse(text) as Partial<EditorSettingsJson>
    const grid = json.grid
    if (grid?.type === 'square') settings.grid.type = grid.type
    if (typeof grid?.show === 'boolean') settings.grid.show = grid.show
    if (typeof grid?.snap === 'boolean') settings.grid.snap = grid.snap
    if (typeof grid?.size === 'number' && isFinite(grid.size) && grid.size >= MIN_GRID_SIZE) {
      settings.grid.size = grid.size
    }
  } catch {
    // hand-edited into invalid JSON: the editor still opens with the defaults
  }
  return settings
}

export function serializeEditorSettings(settings: EditorSettings): string {
  const json: EditorSettingsJson = { waicaEditor: 1, ...settings }
  return JSON.stringify(json, null, 2) + '\n'
}
