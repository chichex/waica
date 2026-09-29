import type { SceneJson } from '@waica/engine'
import { listScenes } from '../fs/prefab-fs'
import type { EditorCore } from './editor-commits'

const EMPTY_SCENE: SceneJson = { waicaScene: 3, entities: [] }

/** Scene files: creating, duplicating and deleting them, each one an undo step. */

export async function createScene(core: EditorCore): Promise<void> {
  const [scenePaths, setScenePaths] = core.library.scenePaths
  const names = new Set(scenePaths.map((p) => p.slice(p.lastIndexOf('/') + 1)))
  let n = 1
  while (names.has(`scene-${n}.scene.json`)) n++
  const path = `src/scenes/scene-${n}.scene.json`
  const text = JSON.stringify(EMPTY_SCENE, null, 2) + '\n'
  await core.fs.writeText(path, text)
  core.history.record({ kind: 'sceneFile', path, before: null, after: text })
  setScenePaths(await listScenes(core.fs))
  core.view.openView({ kind: 'scene', path })
}

export async function duplicateScene(core: EditorCore, path: string): Promise<void> {
  const [scenePaths, setScenePaths] = core.library.scenePaths
  const text = pendingSceneText(core, path) ?? (await core.fs.readText(path))
  if (text == null) return
  const names = new Set(scenePaths.map((p) => p.slice(p.lastIndexOf('/') + 1)))
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.scene\.json$/, '')
  let copy = `${base}-copy`
  for (let n = 2; names.has(`${copy}.scene.json`); n++) copy = `${base}-copy-${n}`
  const newPath = `src/scenes/${copy}.scene.json`
  await core.fs.writeText(newPath, text)
  core.history.record({ kind: 'sceneFile', path: newPath, before: null, after: text })
  setScenePaths(await listScenes(core.fs))
  core.view.openView({ kind: 'scene', path: newPath })
}

export async function deleteScene(core: EditorCore, path: string): Promise<void> {
  const [, setScenePaths] = core.library.scenePaths
  const label = path.slice(path.lastIndexOf('/') + 1)
  if (!window.confirm(`Delete ${label}?`)) return
  const text = pendingSceneText(core, path) ?? (await core.fs.readText(path))
  core.persistence.cancel(`scene:${path}`)
  core.persistence.releaseScene(path)
  await core.fs.deleteFile(path)
  if (text != null) core.history.record({ kind: 'sceneFile', path, before: text, after: null })
  setScenePaths(await listScenes(core.fs))
  if (core.scenes.openScenePath === path) {
    core.scenes.setOpenScenePath(null)
    core.scenes.setOpenScene(null)
    core.selection.clear()
  }
  const { view } = core.view
  if (view?.kind === 'scene' && view.path === path) core.view.setView(null)
}

/** A pending debounced save is newer than the file on disk. */
function pendingSceneText(core: EditorCore, path: string): string | undefined {
  const pending = core.persistence.pendingScene(path)
  return pending ? JSON.stringify(pending, null, 2) + '\n' : undefined
}
