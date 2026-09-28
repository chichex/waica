import { useState, type Dispatch, type SetStateAction } from 'react'
import type { PrefabJson, SceneJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import type { AnimTarget } from './Inspector'
import type { StateTarget } from './StateMachinePanel'
import type { TilemapBrushSelection } from './tilemap-brush'
import { useProjectArt, type ProjectArt } from './use-project-art'
import { useSceneFolders, type SceneFolders } from './use-scene-folders'
import type { ViewportComponentVisibility } from './Viewport'
import { useEditorHistory, type EditorHistoryApi } from './use-editor-history'
import { useEditorView, type EditorView } from './use-editor-view'
import { useEntitySelection, type EntitySelection } from './use-entity-selection'
import { useOpenScene, type OpenScene } from './use-open-scene'
import { usePersistence, type Persistence } from './use-persistence'
import { useProjectCode, type ProjectCode } from './use-project-code'
import { useProjectRestore, type LoadedProject } from './use-project-restore'
import { useProjectSettings, type ProjectSettings } from './use-project-settings'
import { useSoundPreview, type LibrarySoundPreview } from './use-sound-preview'

const IDENTITY_ASSET = (uri: string): string => uri

type State<T> = [T, Dispatch<SetStateAction<T>>]

/** The project's files, and only those: every name the Explorer doesn't show is free to take. */
export interface ProjectLibrary {
  scenePaths: State<string[]>
  prefabLib: State<Record<string, PrefabJson>>
  uiLib: State<Record<string, string>>
}

/** Which modal is open, and for what. */
export interface EditorModals {
  animTarget: State<AnimTarget | null>
  stateTarget: State<StateTarget | null>
  /** New-character flow: the role picker modal is open. */
  rolePicking: State<boolean>
}

/** How the stage renders: what shows, and the brush a tilemap paints with. */
export interface StageOptions {
  /** Structural-edit counter: bumping it rebuilds the stage. */
  epoch: State<number>
  /** Every scene of the project, by catalog name — built for Play. */
  sceneLibrary: State<Record<string, SceneJson>>
  visibility: State<ViewportComponentVisibility>
  tilemapBrush: State<TilemapBrushSelection | null>
}

/** Every piece of state the editor owns, grouped by the domain that owns it. */
export interface EditorState {
  fs: ProjectFS
  persistence: Persistence
  history: EditorHistoryApi
  code: ProjectCode
  art: ProjectArt
  settings: ProjectSettings
  scenes: OpenScene
  folders: SceneFolders
  selection: EntitySelection
  view: EditorView
  library: ProjectLibrary
  modals: EditorModals
  stage: StageOptions
  preview: LibrarySoundPreview
}

export function useEditorState(fs: ProjectFS): EditorState {
  const persistence = usePersistence()
  const history = useEditorHistory()
  const code = useProjectCode(fs)
  const art = useProjectArt(fs, code.archetype.registry.resolveAsset ?? IDENTITY_ASSET)
  const settings = useProjectSettings(fs, persistence, history)
  const scenes = useOpenScene(fs, persistence.pendingScene)
  const folders = useSceneFolders(scenes.openScenePath)
  const selection = useEntitySelection(scenes.scene)
  const view = useEditorView(scenes, selection)
  const library = useProjectLibrary()
  const modals: EditorModals = {
    animTarget: useState<AnimTarget | null>(null),
    stateTarget: useState<StateTarget | null>(null),
    rolePicking: useState(false),
  }
  const stage = useStageOptions()
  const preview = useSoundPreview()
  const state: EditorState = {
    fs, persistence, history, code, art, settings, scenes,
    folders, selection, view, library, modals, stage, preview,
  }
  useProjectRestore(fs, { openScenePath: scenes.openScenePath, view: view.view }, {
    onLoaded: (project) => applyLoadedProject(state, project),
    onFailed: code.fail,
  })
  return state
}

function useProjectLibrary(): ProjectLibrary {
  return {
    scenePaths: useState<string[]>([]),
    prefabLib: useState<Record<string, PrefabJson>>({}),
    uiLib: useState<Record<string, string>>({}),
  }
}

function useStageOptions(): StageOptions {
  return {
    epoch: useState(0),
    sceneLibrary: useState<Record<string, SceneJson>>({}),
    visibility: useState<ViewportComponentVisibility>({ appearance: true, collision: true }),
    tilemapBrush: useState<TilemapBrushSelection | null>(null),
  }
}

/** Installs a freshly read project and reopens where the user left off. */
function applyLoadedProject(state: EditorState, project: LoadedProject): void {
  const [, setScenePaths] = state.library.scenePaths
  const [, setPrefabLib] = state.library.prefabLib
  const [, setUiLib] = state.library.uiLib
  const [, setEpoch] = state.stage.epoch
  setScenePaths(project.scenePaths)
  setPrefabLib(project.prefabs)
  setUiLib(project.ui)
  state.code.hydrate(project.code)
  state.settings.hydrate(project.settings)
  // The viewport may have loaded before the prefab files landed.
  setEpoch((e) => e + 1)
  const { openScenePath, view } = project.workspace
  if (openScenePath) state.scenes.setOpenScenePath(openScenePath)
  if (view) state.view.setView(view)
}
