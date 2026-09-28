import type { ComponentProps } from 'react'
import { reportRejection } from '../report-rejection'
import * as ops from '../scene/ops'
import { createComponentFile } from './code-file-commands'
import type { EditorCore } from './editor-commits'
import { Explorer } from './Explorer'
import { createPrefab, duplicatePrefab, deletePrefab } from './prefab-commands'
import { renamePrefab } from './prefab-rename'
import {
  addEntity,
  addPrefabToScene,
  deleteEntities,
  duplicateEntities,
  renameEntity,
  toggleUiInScene,
} from './scene-entity-commands'
import { createScene, deleteScene, duplicateScene } from './scene-file-commands'
import {
  createFolder,
  deleteFolder,
  dissolveFolder,
  renameFolder,
  reorderEntities,
  reorderEntity,
  reorderFolder,
} from './scene-tree-commands'
import { createUi, deleteUi, duplicateUi } from './ui-commands'

type ExplorerProps = ComponentProps<typeof Explorer>

/** The left panel: the project's scenes, prefabs, UI pieces, code and art, wired to the editor. */
export function EditorExplorer({ core }: { core: EditorCore }) {
  const [scenePaths] = core.library.scenePaths
  const [prefabLib] = core.library.prefabLib
  const [uiLib] = core.library.uiLib
  return (
    <Explorer
      fs={core.fs}
      scenePaths={scenePaths}
      openScenePath={core.scenes.openScenePath}
      scene={core.scenes.scene}
      view={core.view.view}
      selected={core.selection.selected}
      multi={core.selection.multi}
      prefabLib={prefabLib}
      uiLib={uiLib}
      mode={core.view.mode}
      sceneFolders={core.folders}
      customComponents={core.code.customComponents}
      stateFiles={core.code.stateFiles}
      roleFiles={core.code.roleFiles}
      {...sceneSelectionProps(core)}
      {...sceneTreeProps(core)}
      {...libraryProps(core)}
      {...projectFileProps(core)}
    />
  )
}

/** Picking entities in the tree always brings the open scene to the center. */
function sceneSelectionProps(core: EditorCore) {
  const { openScenePath } = core.scenes
  const { selection, view } = core
  const inScene = (select: () => void): void => {
    if (!openScenePath) return
    view.setView({ kind: 'scene', path: openScenePath })
    select()
  }
  return {
    onOpenScene: (path) => view.openView({ kind: 'scene', path }),
    onSelectEntity: (name) => inScene(() => selection.selectEntity(name)),
    onToggleEntity: (name) => inScene(() => selection.toggleEntity(name)),
    onRangeEntities: (names) => inScene(() => selection.rangeEntities(names)),
    onClearSelection: selection.clearSelection,
    onSelectCamera: () => inScene(() => selection.selectEntity(ops.CAMERA_NODE)),
  } satisfies Partial<ExplorerProps>
}

function sceneTreeProps(core: EditorCore) {
  return {
    onAddEntity: () => addEntity(core),
    onCreateScene: () => reportRejection(createScene(core), 'create scene'),
    onCreateFolder: () => createFolder(core),
    onRenameFolder: (from, to) => renameFolder(core, from, to),
    onDissolveFolder: (name) => dissolveFolder(core, name),
    onDeleteFolder: (name) => deleteFolder(core, name),
    onReorderEntity: (name, target) => reorderEntity(core, name, target),
    onReorderFolder: (name, target) => reorderFolder(core, name, target),
    onReorderEntities: (names, target) => reorderEntities(core, names, target),
    onDuplicateScene: (path) => reportRejection(duplicateScene(core, path), 'duplicate scene'),
    onDeleteScene: (path) => reportRejection(deleteScene(core, path), 'delete scene'),
    onDuplicateEntity: (name) => duplicateEntities(core, [name]),
    onDeleteEntity: (name) => deleteEntities(core, [name]),
    onRenameEntity: (from, to) => renameEntity(core, from, to),
    onDeleteEntities: (names) => deleteEntities(core, names),
    onDuplicateEntities: (names) => duplicateEntities(core, names),
  } satisfies Partial<ExplorerProps>
}

function libraryProps(core: EditorCore) {
  const { openView } = core.view
  return {
    onOpenPrefab: (ref) => openView({ kind: 'prefab', ref }),
    onCreatePrefab: (type) => createPrefab(core, type),
    onDuplicatePrefab: (ref) => duplicatePrefab(core, ref),
    onRenamePrefab: (ref, name) => reportRejection(renamePrefab(core, ref, name), 'rename prefab'),
    onDeletePrefab: (ref) => reportRejection(deletePrefab(core, ref), 'delete prefab'),
    onAddPrefabToScene: (ref) => addPrefabToScene(core, ref),
    onOpenUi: (name) => openView({ kind: 'ui', name }),
    onCreateUi: () => createUi(core),
    onDuplicateUi: (name) => duplicateUi(core, name),
    onDeleteUi: (name) => reportRejection(deleteUi(core, name), 'delete ui'),
    onToggleUiInScene: (name) => toggleUiInScene(core, name),
  } satisfies Partial<ExplorerProps>
}

function projectFileProps(core: EditorCore) {
  const { art, preview } = core
  const { openView, view, setView } = core.view
  return {
    art: art.art,
    onImportArt: art.importArt,
    importProgress: art.importProgress,
    onRefreshArt: art.refresh,
    previewingPath: preview.previewingPath,
    onPreviewSound: preview.play,
    onStopPreview: preview.stop,
    onOpenScript: (name) => openView({ kind: 'script', name }),
    onCreateComponent: () => reportRejection(createComponentFile(core), 'create component file'),
    onOpenComponentFile: (path) => openView({ kind: 'componentFile', path }),
    onOpenStateFile: (path) => openView({ kind: 'stateFile', path }),
    onOpenArt: (item) => openView({ kind: 'art', label: item.label, url: item.url, path: item.path }),
    onOpenControls: () => openView({ kind: 'controls' }),
    onOpenStats: () => openView({ kind: 'stats' }),
    onOpenGame: () => openView({ kind: 'game' }),
    onArtDeleted: (path) => {
      if (view?.kind === 'art' && view.path === path) setView(null)
    },
  } satisfies Partial<ExplorerProps>
}
