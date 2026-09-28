import type { SceneJson } from '@waica/engine'
import * as ops from '../scene/ops'
import { parseSceneJson } from '../scene/scene-file'
import type { EditorCore } from './editor-commits'
import { sceneLabel } from './icons'

/** Starts Play on the open scene with the project's freshest code and scene catalog. */
export async function play(core: EditorCore): Promise<void> {
  const { openScenePath, scene, sceneSwitching } = core.scenes
  // Starting mid-switch would build the run from the outgoing scene and
  // label it with the incoming one — and when the read lands, the
  // [scenePath] effect would hot-swap the scene under the live session.
  if (!openScenePath || !scene || sceneSwitching) return
  // The preview control is disabled in play mode (CA-18) and couldn't be
  // reached to stop it otherwise, so a run in progress must not be left
  // playing over the game's own audio.
  core.preview.stop()
  core.selection.clear()
  // Project components, states and roles register before the Play game is
  // built, so the run uses the same extension layer as the shipped game.
  await core.code.run('play')
  const [, setSceneLibrary] = core.stage.sceneLibrary
  setSceneLibrary(await sceneCatalog(core, scene))
  core.bumpEpoch()
  // Play may be pressed from any view (prefab, ui…): the run happens in the
  // scene viewport, so bring the open scene to the center first.
  core.view.setView({ kind: 'scene', path: openScenePath })
  core.view.setMode('play')
}

export function stop(core: EditorCore): void {
  core.view.setMode('edit')
}

/**
 * The catalog a SceneTransition resolves against. Without it, crossing a
 * door in Play only logs `unknown scene`. Built here rather than kept in
 * sync all session: it only matters while playing, and Play rebuilds the
 * Game anyway. Freshest wins — the displayed scene, then a debounced
 * save still in flight, then the file on disk.
 */
async function sceneCatalog(core: EditorCore, displayed: SceneJson): Promise<Record<string, SceneJson>> {
  const [scenePaths] = core.library.scenePaths
  const library: Record<string, SceneJson> = {}
  for (const path of scenePaths) {
    const name = sceneLabel(path)
    if (path === core.scenes.loadedScenePath) {
      library[name] = displayed
      continue
    }
    const unsaved = core.persistence.pendingScene(path)
    if (unsaved) {
      library[name] = unsaved
      continue
    }
    const text = await core.fs.readText(path)
    if (text == null) continue
    try {
      library[name] = ops.migrateScene(parseSceneJson(text))
    } catch {
      console.error(`[waica] Play could not read scene ${path}`)
    }
  }
  return library
}
