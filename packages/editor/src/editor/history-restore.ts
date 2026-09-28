import type { PrefabJson, SceneJson } from '@waica/engine'
import { listScenes, prefabPath, savePrefab } from '../fs/prefab-fs'
import { saveUi, uiPath } from '../fs/ui-fs'
import { reportRejection } from '../report-rejection'
import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { withoutKey } from './prefab-commands'

/**
 * Undo/redo restorers: each puts one recorded value back through the normal
 * save path and fixes up whatever was showing it.
 */

/** Puts a recorded scene value back (undo/redo), through the normal save path. */
export function applySceneState(core: EditorCore, path: string, value: SceneJson): void {
  core.scheduleSave(path, value)
  if (core.scenes.loadedScenePath !== path) return
  core.scenes.setOpenScene({ path, scene: value })
  // The viewport patches props imperatively on live entities, so a plain
  // setScene isn't enough: rebuild the stage from the restored JSON.
  core.bumpEpoch()
  // The restored scene may not contain the current selection.
  core.selection.setSelected((s) => (s && s !== ops.CAMERA_NODE && !ops.findEntity(value, s) ? null : s))
  core.selection.setMulti((m) => {
    const left = m.filter((n) => ops.findEntity(value, n))
    return left.length > 1 ? left : []
  })
}

/** Creates or deletes a scene file back (undo/redo of create/duplicate/delete). */
export async function applySceneFile(core: EditorCore, path: string, content: string | null): Promise<void> {
  const { fs, persistence, scenes } = core
  const [, setScenePaths] = core.library.scenePaths
  persistence.cancel(`scene:${path}`)
  persistence.releaseScene(path)
  persistence.setSaveState('saving')
  try {
    if (content == null) {
      await fs.deleteFile(path).catch(() => {})
      if (scenes.openScenePath === path) {
        scenes.setOpenScenePath(null)
        core.selection.clear()
      }
      if (scenes.loadedScenePath === path) scenes.setOpenScene(null)
      const { view } = core.view
      if (view?.kind === 'scene' && view.path === path) core.view.setView(null)
    } else {
      await fs.writeText(path, content)
    }
    setScenePaths(await listScenes(fs))
    persistence.setSaveState('saved')
  } catch {
    persistence.setSaveState('error')
  }
}

export function applyPrefabState(core: EditorCore, ref: string, value: PrefabJson | null): void {
  const { fs, persistence } = core
  const [, setPrefabLib] = core.library.prefabLib
  persistence.cancel(`prefab:${ref}`)
  persistence.setSaveState('saving')
  if (value == null) {
    setPrefabLib((lib) => withoutKey(lib, ref))
    const { view } = core.view
    if (view?.kind === 'prefab' && view.ref === ref) core.view.setView(null)
    // The file may never have landed (undoing a debounced create): ignore.
    reportRejection(fs
      .deleteFile(prefabPath(ref))
      .catch(() => {})
      .then(() => persistence.setSaveState('saved')), 'delete file')
  } else {
    setPrefabLib((lib) => ({ ...lib, [ref]: value }))
    savePrefab(fs, ref, value)
      .then(() => persistence.setSaveState('saved'))
      .catch(() => persistence.setSaveState('error'))
  }
  core.bumpEpoch()
}

export function applyUiState(core: EditorCore, name: string, value: string | null): void {
  const { fs, persistence } = core
  const [, setUiLib] = core.library.uiLib
  persistence.cancel(`ui:${name}`)
  persistence.setSaveState('saving')
  if (value == null) {
    setUiLib((lib) => withoutKey(lib, name))
    const { view } = core.view
    if (view?.kind === 'ui' && view.name === name) core.view.setView(null)
    reportRejection(fs
      .deleteFile(uiPath(name))
      .catch(() => {})
      .then(() => persistence.setSaveState('saved')), 'delete file')
  } else {
    setUiLib((lib) => ({ ...lib, [name]: value }))
    saveUi(fs, name, value)
      .then(() => persistence.setSaveState('saved'))
      .catch(() => persistence.setSaveState('error'))
  }
}
