import type { PrefabJson, SceneJson } from '@waica/engine'
import { prefabPath, savePrefab } from '../fs/prefab-fs'
import * as ops from '../scene/ops'
import { parseSceneJson } from '../scene/scene-file'
import type { EditorCore } from './editor-commits'
import { refBase } from './Explorer'
import { withoutKey } from './prefab-commands'

const PREFAB_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** One scene whose entities point at the renamed prefab, before and after the rename. */
interface RenamedScene {
  path: string
  before: SceneJson
  after: SceneJson
}

interface PrefabRename {
  ref: string
  nextRef: string
  prefab: PrefabJson
}

/**
 * Renames a prefab file and rewrites every scene that instances it — on disk
 * first, then on screen, as one undo step. A bad name or an unreadable scene
 * leaves everything as it was.
 */
export async function renamePrefab(core: EditorCore, ref: string, to: string): Promise<void> {
  const rename = validRename(core, ref, to)
  if (!rename) return
  let scenes: RenamedScene[]
  try {
    scenes = await renamedScenes(core, rename)
  } catch {
    window.alert('Could not rename the prefab because a scene could not be read.')
    return
  }
  core.persistence.setSaveState('saving')
  core.persistence.cancel(`prefab:${ref}`)
  try {
    await writeRename(core, rename, scenes)
  } catch {
    core.persistence.setSaveState('error')
    return
  }
  showRename(core, rename, scenes)
  core.persistence.setSaveState('saved')
}

function validRename(core: EditorCore, ref: string, to: string): PrefabRename | null {
  const [prefabLib] = core.library.prefabLib
  const prefab = prefabLib[ref]
  if (!prefab) return null
  const base = to.trim()
  if (!base || base === refBase(ref)) return null
  if (!PREFAB_NAME_RE.test(base)) {
    window.alert('Prefab names must start with a letter or number and use only letters, numbers, dashes, or underscores.')
    return null
  }
  const nextRef = `${ref.slice(0, ref.indexOf('/'))}/${base}`
  if (prefabLib[nextRef]) {
    window.alert(`A prefab named "${base}" already exists.`)
    return null
  }
  return { ref, nextRef, prefab }
}

/** The freshest copy of every scene that uses the prefab, with its entities pointed at the new ref. */
async function renamedScenes(core: EditorCore, { ref, nextRef }: PrefabRename): Promise<RenamedScene[]> {
  const [scenePaths] = core.library.scenePaths
  const { loadedScenePath, scene } = core.scenes
  const affected: RenamedScene[] = []
  for (const path of scenePaths) {
    let before = path === loadedScenePath && scene ? scene : core.persistence.pendingScene(path) ?? null
    if (!before) {
      const text = await core.fs.readText(path)
      if (text == null) throw new Error(`missing scene: ${path}`)
      before = ops.migrateScene(parseSceneJson(text))
    }
    if (!before.entities.some((entity) => entity.prefab === ref)) continue
    const after: SceneJson = {
      ...before,
      entities: before.entities.map((entity) =>
        entity.prefab === ref ? { ...entity, prefab: nextRef } : entity,
      ),
    }
    affected.push({ path, before, after })
  }
  return affected
}

/** Writes the new prefab and all references before removing the old file. */
async function writeRename(core: EditorCore, rename: PrefabRename, scenes: RenamedScene[]): Promise<void> {
  const { fs, persistence } = core
  await savePrefab(fs, rename.nextRef, rename.prefab)
  for (const { path, after } of scenes) {
    persistence.cancel(`scene:${path}`)
    persistence.holdScene(path, after)
    await fs.writeText(path, JSON.stringify(after, null, 2) + '\n')
    persistence.releaseScene(path, after)
  }
  if ((await fs.readText(prefabPath(rename.ref))) != null) await fs.deleteFile(prefabPath(rename.ref))
}

/** Records the rename as one undo step and moves everything on screen to the new ref. */
function showRename(core: EditorCore, { ref, nextRef, prefab }: PrefabRename, scenes: RenamedScene[]): void {
  core.history.recordBatch(() => {
    core.history.record({ kind: 'prefab', ref: nextRef, before: null, after: prefab })
    core.history.record({ kind: 'prefab', ref, before: prefab, after: null })
    for (const { path, before, after } of scenes) {
      core.history.record({ kind: 'scene', path, before, after })
    }
  })
  const [, setPrefabLib] = core.library.prefabLib
  setPrefabLib((lib) => ({ ...withoutKey(lib, ref), [nextRef]: prefab }))
  const openAffected = scenes.find(({ path }) => path === core.scenes.loadedScenePath)
  if (openAffected) {
    core.scenes.setOpenScene((current) =>
      current && current.scene === openAffected.before ? { ...current, scene: openAffected.after } : current,
    )
  }
  core.view.setView((current) =>
    current?.kind === 'prefab' && current.ref === ref ? { kind: 'prefab', ref: nextRef } : current,
  )
  const [, setAnimTarget] = core.modals.animTarget
  const [, setStateTarget] = core.modals.stateTarget
  setAnimTarget((current) => (current?.kind === 'prefab' && current.ref === ref ? { ...current, ref: nextRef } : current))
  setStateTarget((current) => (current?.kind === 'prefab' && current.ref === ref ? { ...current, ref: nextRef } : current))
  core.bumpEpoch()
}
