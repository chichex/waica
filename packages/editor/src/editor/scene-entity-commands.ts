import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { refBase } from './Explorer'

/**
 * Entity edits on the open scene: each one commits through the scene commit
 * point and keeps the entity selection consistent with the result.
 */

export function addEntity(core: EditorCore): void {
  const { scene, openScenePath } = core.scenes
  if (!scene || !openScenePath) return
  const name = ops.uniqueName(scene, 'Entity')
  core.commit(
    ops.addEntity(scene, {
      name,
      position: [0, 0],
      components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0x8ecae6 } }],
    }),
    true,
  )
  core.view.setView({ kind: 'scene', path: openScenePath })
  core.selection.selectEntity(name)
}

export function addPrefabToScene(core: EditorCore, ref: string): void {
  const { scene, openScenePath } = core.scenes
  if (!scene || !openScenePath) return
  const name = ops.uniqueName(scene, capitalized(refBase(ref)))
  core.commit(ops.addEntity(scene, { name, prefab: ref, position: [0, 0] }), true)
  core.view.setView({ kind: 'scene', path: openScenePath })
  core.selection.selectEntity(name)
}

/** A prefab dragged from the library onto the viewport, at the (already snapped) drop point. */
export function dropPrefab(core: EditorCore, data: string, world: [number, number]): void {
  const { scene } = core.scenes
  if (!scene) return
  const [prefabLib] = core.library.prefabLib
  // Legacy 'waica/template' payloads carry the base name, not the ref.
  const ref = prefabLib[data] ? data : Object.keys(prefabLib).find((r) => refBase(r) === data)
  if (!ref) return
  const name = ops.uniqueName(scene, capitalized(refBase(ref)))
  const position: [number, number] = [Math.round(world[0] * 100) / 100, Math.round(world[1] * 100) / 100]
  core.commit(ops.addEntity(scene, { name, prefab: ref, position }), true)
  core.selection.selectEntity(name)
}

export function duplicateEntities(core: EditorCore, names: string[]): void {
  const { scene, openScenePath } = core.scenes
  if (!scene || !openScenePath || names.length === 0) return
  let next = scene
  const copies: string[] = []
  for (const name of names) {
    const entity = ops.findEntity(next, name)
    if (!entity) continue
    const copy = structuredClone(entity)
    copy.name = ops.uniqueName(next, name)
    // Nudge the copy so it doesn't hide exactly behind the original.
    const [x, y] = entity.position ?? [0, 0]
    copy.position = [x + 0.5, y]
    next = ops.addEntity(next, copy)
    copies.push(copy.name)
  }
  const [firstCopy] = copies
  if (firstCopy === undefined) return
  core.commit(next, true)
  core.view.setView({ kind: 'scene', path: openScenePath })
  // The copies become the selection, ready to drag somewhere as a group.
  core.selection.setSelected(firstCopy)
  core.selection.setMulti(copies.length > 1 ? copies : [])
}

export function deleteEntities(core: EditorCore, names: string[]): void {
  const { scene } = core.scenes
  if (!scene || names.length === 0) return
  if (names.length > 1 && !window.confirm(`Delete ${names.length} entities?`)) return
  core.commit(ops.removeEntities(scene, names), true)
  core.selection.setSelected((s) => (s && names.includes(s) ? null : s))
  core.selection.setMulti([])
}

export function renameEntity(core: EditorCore, from: string, to: string): void {
  const { scene } = core.scenes
  if (!scene) return
  const trimmed = to.trim()
  if (!trimmed || trimmed === from) return
  const name = ops.uniqueName(scene, trimmed)
  core.commit(ops.renameEntity(scene, from, name), true)
  core.selection.setSelected((s) => (s === from ? name : s))
  core.selection.setMulti((m) => m.map((n) => (n === from ? name : n)))
}

export function toggleUiInScene(core: EditorCore, name: string): void {
  const { scene, openScenePath } = core.scenes
  if (!scene || !openScenePath) return
  const current = scene.ui ?? []
  const ui = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
  const next = { ...scene }
  if (ui.length > 0) next.ui = ui
  else delete next.ui
  core.commit(next)
}

function capitalized(base: string): string {
  return base.charAt(0).toUpperCase() + base.slice(1)
}
