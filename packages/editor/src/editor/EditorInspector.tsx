import type { ComponentProps } from 'react'
import type { InputBindings } from '@waica/engine'
import { DEFAULT_GAME_SETTINGS } from '../project/game'
import { reportRejection } from '../report-rejection'
import { createRoleFile } from './code-file-commands'
import type { EditorCore } from './editor-commits'
import { EMPTY_STATS } from './EditorCenter'
import { Inspector } from './Inspector'
import { entityComponentHandlers, entityPropHandlers, overrideHandlers } from './inspector-entity-handlers'
import { prefabAppearanceHandlers, prefabPropHandlers } from './inspector-prefab-handlers'
import { inspectorSelection } from './inspector-selection'
import { entityMachinePatch } from './modal-commands'
import { prefabMachinePatch } from './prefab-commands'
import { deleteEntities, renameEntity } from './scene-entity-commands'
import type { ViewportAccess } from './use-viewport-handle'

const EMPTY_ACTIONS: InputBindings = {}

/** The right panel: the Inspector for whatever is open or picked, wired to the editor's commits. */
export function EditorInspector({ core, viewport }: { core: EditorCore; viewport: ViewportAccess }) {
  const { art } = core
  const [prefabLib] = core.library.prefabLib
  const [uiLib] = core.library.uiLib
  const [visibility, setVisibility] = core.stage.visibility
  const [tilemapBrush, setTilemapBrush] = core.stage.tilemapBrush
  const [, setAnimTarget] = core.modals.animTarget
  const [, setStateTarget] = core.modals.stateTarget
  return (
    <Inspector
      selection={inspectorSelection(core)}
      prefabs={prefabLib}
      art={art.art}
      uiPieces={Object.keys(uiLib)}
      urlFor={art.urlFor}
      onImportArt={art.importArt}
      viewportVisibility={visibility}
      tilemapBrush={tilemapBrush}
      onTilemapBrush={setTilemapBrush}
      onViewportVisibility={(role, visible) => setVisibility((current) => ({ ...current, [role]: visible }))}
      onRename={(from, to) => renameEntity(core, from, to)}
      onDelete={(name) => deleteEntities(core, [name])}
      onOpenPrefab={(ref) => core.view.openView({ kind: 'prefab', ref })}
      onEditAnimation={setAnimTarget}
      onMachinePatch={(name, patch) => entityMachinePatch(core, name, patch)}
      onPrefabMachinePatch={(ref, patch) => prefabMachinePatch(core, ref, patch)}
      onCreateRoleFile={(role) => reportRejection(createRoleFile(core, role), 'create role file')}
      onEditState={setStateTarget}
      {...projectProps(core)}
      {...entityPropHandlers(core, viewport)}
      {...entityComponentHandlers(core)}
      {...overrideHandlers(core)}
      {...prefabPropHandlers(core, viewport)}
      {...prefabAppearanceHandlers(core)}
    />
  )
}

/** The project facts the Inspector's forms offer: stats, actions, code files and game settings. */
function projectProps(core: EditorCore) {
  const { settings, code } = core
  return {
    stats: settings.stats ?? EMPTY_STATS,
    actions: settings.controls ?? EMPTY_ACTIONS,
    pixelsPerUnit: settings.gameSettings?.pixelsPerUnit ?? DEFAULT_GAME_SETTINGS.pixelsPerUnit,
    resolution: settings.gameSettings?.resolution ?? DEFAULT_GAME_SETTINGS.resolution,
    sceneCamera: core.scenes.scene?.camera,
    stateFiles: code.stateFiles,
    roleFiles: code.roleFiles,
  } satisfies Partial<ComponentProps<typeof Inspector>>
}
