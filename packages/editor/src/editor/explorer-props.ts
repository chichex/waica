import type { MouseEvent } from 'react'
import type { PrefabJson, SceneJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import type { DropTarget } from '../scene/ops'
import type { MenuEntry } from './ContextMenu'
import type { SceneFolders } from './use-scene-folders'
import type { ArtItem, DroppedFile } from './use-project-art'

/**
 * The Explorer's contract with the Editor, shared by its panels: what the
 * center pane is looking at, the project data the panels list, and the
 * edits they ask for.
 */

/** What the center pane (and the inspector) is looking at. */
export type ExplorerView =
  | { kind: 'scene'; path: string }
  | { kind: 'prefab'; ref: string }
  | { kind: 'ui'; name: string }
  | { kind: 'script'; name: string }
  | { kind: 'stateFile'; path: string }
  | { kind: 'componentFile'; path: string }
  | { kind: 'art'; label: string; url: string; path: string }
  | { kind: 'controls' }
  | { kind: 'stats' }
  | { kind: 'game' }

/** Opens the Explorer's context menu at the pointer with these entries. */
export type OpenMenu = (e: MouseEvent, entries: MenuEntry[]) => void

/** A row being renamed inline (double-click, F2 or the context menu). */
export interface RenameTarget {
  kind: 'entity' | 'folder' | 'prefab'
  name: string
}

/** The one inline rename the Explorer allows at a time, across its panels. */
export interface Renaming {
  editing: RenameTarget | null
  setEditing: (target: RenameTarget | null) => void
}

export interface ExplorerProps {
  fs: ProjectFS
  scenePaths: string[]
  openScenePath: string | null
  /** Expanded folders of the open scene's tree, owned by the Editor per scene file. */
  sceneFolders: SceneFolders
  /** The open scene's contents (for the expanded entity subtree). */
  scene: SceneJson | null
  view: ExplorerView | null
  selected: string | null
  /** Multi-selection (shift/cmd click): [] or 2+ names — never a single one. */
  multi: string[]
  /** The project's own files — all of them are listed, nothing else exists. */
  prefabLib: Record<string, PrefabJson>
  uiLib: Record<string, string>
  art: ArtItem[]
  onImportArt: (files: DroppedFile[]) => Promise<void>
  /** Live progress while an import is writing files; null when idle. */
  importProgress: { done: number; total: number } | null
  onRefreshArt: () => void
  /** Whether the project is running (CA-18): disables the sound preview control. */
  mode: 'edit' | 'play'
  /**
   * The project path of the sound row currently previewing, or null (review
   * finding B: at most one at a time). Keyed on `item.path`, never on
   * `item.url`: `useProjectArt` revokes and recreates every object URL on
   * each re-scan, so a url-keyed toggle loses track of the playing row the
   * moment art is imported or deleted — the row shows ▶ again while the
   * `<audio>` keeps playing, with no control left to stop it (review
   * finding 1, a regression of the same unstoppable-preview bug finding B
   * fixed). `path` is stable across re-scans, so it stays matched.
   */
  previewingPath: string | null
  /** Starts a sound row's preview, through the editor's own audio path — never game.audio. */
  onPreviewSound: (item: ArtItem) => void
  /** Stops the sound row preview currently playing. */
  onStopPreview: () => void
  onOpenScene: (path: string) => void
  onSelectEntity: (name: string) => void
  /** Cmd/Ctrl-click: toggles the entity in the multi-selection. */
  onToggleEntity: (name: string) => void
  /** Shift-click / select-all: replaces the selection with this run. */
  onRangeEntities: (names: string[]) => void
  /** Escape: drops the multi-selection first, then the single selection. */
  onClearSelection: () => void
  /** Selects the open scene's built-in camera. */
  onSelectCamera: () => void
  onAddEntity: () => void
  onCreateScene: () => void
  onCreateFolder: () => void
  onRenameFolder: (from: string, to: string) => void
  /** Removes the folder, moving its entities back to root level. */
  onDissolveFolder: (name: string) => void
  /** Removes the folder AND its entities. */
  onDeleteFolder: (name: string) => void
  onReorderEntity: (name: string, target: DropTarget) => void
  onReorderFolder: (name: string, target: Exclude<DropTarget, { into: string }>) => void
  onOpenPrefab: (ref: string) => void
  onOpenScript: (name: string) => void
  /** Exported project component name and the file that defines it. */
  customComponents: Array<{ name: string; path: string }>
  onCreateComponent: () => void
  onOpenComponentFile: (path: string) => void
  /** Basenames in src/states/ — the project's state code files. */
  stateFiles: string[]
  /** Basenames in src/roles/ — the project's custom role files. */
  roleFiles: string[]
  onOpenStateFile: (path: string) => void
  onOpenArt: (item: ArtItem) => void
  onOpenControls: () => void
  onOpenStats: () => void
  onOpenGame: () => void
  onDuplicateScene: (path: string) => void
  onDeleteScene: (path: string) => void
  onDuplicateEntity: (name: string) => void
  onDeleteEntity: (name: string) => void
  onRenameEntity: (from: string, to: string) => void
  onDeleteEntities: (names: string[]) => void
  onDuplicateEntities: (names: string[]) => void
  onReorderEntities: (names: string[], target: DropTarget) => void
  onCreatePrefab: (type: PrefabJson['type']) => void
  onDuplicatePrefab: (ref: string) => void
  onRenamePrefab: (ref: string, name: string) => void
  onDeletePrefab: (ref: string) => void
  onAddPrefabToScene: (ref: string) => void
  onOpenUi: (name: string) => void
  onCreateUi: () => void
  onDuplicateUi: (name: string) => void
  onDeleteUi: (name: string) => void
  /** Adds/removes the piece from the open scene's "ui" start list. */
  onToggleUiInScene: (name: string) => void
  onArtDeleted: (path: string) => void
}
