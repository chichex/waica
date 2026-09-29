import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { InputBindings } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import {
  CONTROLS_PATH,
  parseControlLabels,
  parseControls,
  serializeControls,
  type ActionLabels,
  type ProjectControls,
} from '../project/controls'
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_SETTINGS_PATH,
  parseEditorSettings,
  serializeEditorSettings,
  type EditorSettings,
  type GridSettings,
} from '../project/editor-settings'
import { GAME_PATH, serializeGameSettings, type GameSettings } from '../project/game'
import { STATS_PATH, parseStats, serializeStats, type ProjectStats } from '../project/stats'
import type { EditorHistoryApi } from './use-editor-history'
import type { Persistence } from './use-persistence'

/** The project-wide settings files as read from disk, before parsing. */
export interface LoadedSettings {
  controlsText: string | null
  statsText: string | null
  editorText: string | null
  game: GameSettings
  /** The archetype's default bindings, for a project without controls.json. */
  bindings: InputBindings
}

/**
 * The project-wide settings the editor edits in place — controls, stats,
 * game and editor settings — each written to its own file. Every value is
 * null until the project's file is read (or defaulted).
 */
export interface ProjectSettings {
  controls: InputBindings | null
  /** The project's own names for its actions; the archetype's stay in its manifest. */
  controlLabels: ActionLabels
  stats: ProjectStats | null
  gameSettings: GameSettings | null
  editorSettings: EditorSettings | null
  /** Stable: fills every setting from the files the project restore read. */
  hydrate: (loaded: LoadedSettings) => void
  applyControls: (next: ProjectControls) => void
  commitControls: (next: ProjectControls) => void
  applyStats: (next: ProjectStats) => void
  commitStats: (next: ProjectStats) => void
  commitGrid: (grid: GridSettings) => void
  applyGameSettings: (next: GameSettings) => void
  commitGameSettings: (next: GameSettings) => void
}

export function useProjectSettings(
  fs: ProjectFS,
  persistence: Persistence,
  history: EditorHistoryApi,
): ProjectSettings {
  const controls = useState<InputBindings | null>(null)
  const controlLabels = useState<ActionLabels>({})
  const stats = useState<ProjectStats | null>(null)
  const gameSettings = useState<GameSettings | null>(null)
  const editorSettings = useState<EditorSettings | null>(null)
  const [, setControls] = controls
  const [, setControlLabels] = controlLabels
  const [, setStats] = stats
  const [, setGameSettings] = gameSettings
  const [, setEditorSettings] = editorSettings

  const hydrate = useCallback((loaded: LoadedSettings): void => {
    setControls(parseControls(loaded.controlsText, loaded.bindings))
    setControlLabels(parseControlLabels(loaded.controlsText))
    setStats(parseStats(loaded.statsText))
    setGameSettings(loaded.game)
    setEditorSettings(parseEditorSettings(loaded.editorText))
  }, [setControls, setControlLabels, setStats, setGameSettings, setEditorSettings])

  const state = { controls, controlLabels, stats, gameSettings, editorSettings }
  return {
    controls: controls[0],
    controlLabels: controlLabels[0],
    stats: stats[0],
    gameSettings: gameSettings[0],
    editorSettings: editorSettings[0],
    hydrate,
    ...settingsCommits({ fs, persistence, history }, state),
  }
}

type State<T> = [T, Dispatch<SetStateAction<T>>]

interface SettingsState {
  controls: State<InputBindings | null>
  controlLabels: State<ActionLabels>
  stats: State<ProjectStats | null>
  gameSettings: State<GameSettings | null>
  editorSettings: State<EditorSettings | null>
}

/** apply* shows a value and schedules its file write: undo/redo put values back through them. */
function settingsWrites(fs: ProjectFS, schedule: Persistence['schedule'], state: SettingsState) {
  const [, setControls] = state.controls
  const [, setControlLabels] = state.controlLabels
  const [, setStats] = state.stats
  const [, setGameSettings] = state.gameSettings
  const [editorSettings, setEditorSettings] = state.editorSettings
  return {
    applyControls: (next: ProjectControls): void => {
      setControls(next.bindings)
      setControlLabels(next.labels)
      schedule('controls', () => fs.writeText(CONTROLS_PATH, serializeControls(next.bindings, next.labels)))
    },
    applyStats: (next: ProjectStats): void => {
      setStats(next)
      schedule('stats', () => fs.writeText(STATS_PATH, serializeStats(next)))
    },
    applyGameSettings: (next: GameSettings): void => {
      setGameSettings(next)
      schedule('game', () => fs.writeText(GAME_PATH, serializeGameSettings(next)))
    },
    commitGrid: (grid: GridSettings): void => {
      const next = { ...(editorSettings ?? DEFAULT_EDITOR_SETTINGS), grid }
      setEditorSettings(next)
      schedule('editor', () => fs.writeText(EDITOR_SETTINGS_PATH, serializeEditorSettings(next)))
    },
  }
}

/** commit* records the change as one undo step, then applies it. */
function settingsCommits(
  { fs, persistence, history }: { fs: ProjectFS; persistence: Persistence; history: EditorHistoryApi },
  state: SettingsState,
) {
  const { record } = history
  const [controls] = state.controls
  const [controlLabels] = state.controlLabels
  const [stats] = state.stats
  const [gameSettings] = state.gameSettings
  const writes = settingsWrites(fs, persistence.schedule, state)
  return {
    ...writes,
    // Labels travel with the bindings so undoing a new action also undoes the
    // name it was born with.
    commitControls: (next: ProjectControls): void => {
      if (controls) {
        record({ kind: 'controls', before: { bindings: controls, labels: controlLabels }, after: next })
      }
      writes.applyControls(next)
    },
    commitStats: (next: ProjectStats): void => {
      if (stats) record({ kind: 'stats', before: stats, after: next }, 'stats')
      writes.applyStats(next)
    },
    commitGameSettings: (next: GameSettings): void => {
      if (gameSettings) record({ kind: 'game', before: gameSettings, after: next }, 'game')
      writes.applyGameSettings(next)
    },
  }
}
