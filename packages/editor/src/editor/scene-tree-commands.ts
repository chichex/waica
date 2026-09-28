import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { duplicateEntities } from './scene-entity-commands'

/**
 * The open scene's tree: folders, spawn order, and the selection shortcuts
 * (duplicate, group) that act on it.
 */

export function createFolder(core: EditorCore): void {
  const { scene } = core.scenes
  if (!scene) return
  const folder = ops.uniqueFolderName(scene, 'Folder')
  core.commit(ops.addFolder(scene, folder))
  core.folders.open(folder)
}

export function renameFolder(core: EditorCore, from: string, to: string): void {
  const { scene } = core.scenes
  if (!scene) return
  const trimmed = to.trim()
  if (!trimmed || trimmed === from) return
  core.commit(ops.renameFolder(scene, from, ops.uniqueFolderName(scene, trimmed)))
}

export function dissolveFolder(core: EditorCore, name: string): void {
  const { scene } = core.scenes
  if (scene) core.commit(ops.dissolveFolder(scene, name))
}

export function deleteFolder(core: EditorCore, name: string): void {
  const { scene } = core.scenes
  if (!scene) return
  const doomed = scene.entities.filter((e) => e.folder === name)
  const suffix = doomed.length === 0 ? '' : ` and its ${doomed.length} entit${doomed.length === 1 ? 'y' : 'ies'}`
  if (!window.confirm(`Delete ${name}${suffix}?`)) return
  core.commit(ops.deleteFolder(scene, name), true)
  core.selection.setSelected((s) => (doomed.some((e) => e.name === s) ? null : s))
  core.selection.setMulti((m) => {
    const left = m.filter((n) => !doomed.some((e) => e.name === n))
    return left.length > 1 ? left : []
  })
}

// Spawn order follows the entities array, so reordering is structural.
export function reorderEntity(core: EditorCore, name: string, target: ops.DropTarget): void {
  const { scene } = core.scenes
  if (scene) core.commit(ops.reorderEntity(scene, name, target), true)
}

export function reorderFolder(
  core: EditorCore,
  name: string,
  target: Exclude<ops.DropTarget, { into: string }>,
): void {
  const { scene } = core.scenes
  if (scene) core.commit(ops.reorderFolder(scene, name, target), true)
}

export function reorderEntities(core: EditorCore, names: string[], target: ops.DropTarget): void {
  const { scene } = core.scenes
  if (scene) core.commit(ops.reorderEntities(scene, names, target), true)
}

/** The scene entities a global shortcut applies to: the multi-selection, or the selected entity. */
function selectionNames(core: EditorCore): string[] {
  const [animTarget] = core.modals.animTarget
  const { selected, multi } = core.selection
  if (core.view.mode !== 'edit' || animTarget || core.view.view?.kind !== 'scene') return []
  if (multi.length > 1) return multi
  if (selected && core.scenes.scene?.entities.some((e) => e.name === selected)) return [selected]
  return []
}

/** Cmd/Ctrl+D: duplicates the scene selection (multi, or the single entity). */
export function duplicateSelection(core: EditorCore): void {
  duplicateEntities(core, selectionNames(core))
}

/** Cmd/Ctrl+G: groups the scene selection into a new folder. */
export function groupSelection(core: EditorCore): void {
  const names = selectionNames(core)
  const { scene } = core.scenes
  if (!scene || names.length === 0) return
  const folder = ops.uniqueFolderName(scene, 'Group')
  core.commit(ops.reorderEntities(ops.addFolder(scene, folder), names, { into: folder }), true)
  // A brand-new folder holding the grouped entities opens, so they stay in sight.
  core.folders.open(folder)
}
