import type { PrefabJson, SceneJson } from '@waica/engine'
import { savePrefab } from '../fs/prefab-fs'
import { saveUi } from '../fs/ui-fs'
import type { EditorState } from './editor-state'

/**
 * The editor's commit points: each records one undo step, updates what is on
 * screen and schedules the file write. Every edit goes through one of these.
 */
export type EditorCommits = ReturnType<typeof createCommits>

export type EditorCore = EditorState & EditorCommits

export function createCommits(state: EditorState) {
  const { fs, persistence, history, scenes } = state
  const [prefabLib, setPrefabLib] = state.library.prefabLib
  const [uiLib, setUiLib] = state.library.uiLib
  const [, setEpoch] = state.stage.epoch
  const bumpEpoch = (): void => setEpoch((e) => e + 1)

  /** Debounced per path: an edit in one scene must never cancel another's write. */
  const scheduleSave = (path: string, next: SceneJson): void => {
    persistence.holdScene(path, next)
    persistence.schedule(`scene:${path}`, () =>
      fs.writeText(path, JSON.stringify(next, null, 2) + '\n').then(() => persistence.releaseScene(path, next)),
    )
  }

  /** Edits the displayed scene; `structural` rebuilds the stage. */
  const commit = (next: SceneJson, structural = false, coalesce?: string): void => {
    // The displayed scene's own path, not openScenePath: while another scene
    // file is being read those two differ, and the edit belongs to what the
    // user is actually looking at.
    const path = scenes.loadedScenePath
    if (!path || !scenes.scene || scenes.sceneSwitching) return
    history.record(
      { kind: 'scene', path, before: scenes.scene, after: next },
      coalesce ? `scene:${path}:${coalesce}` : undefined,
    )
    scenes.setOpenScene({ path, scene: next })
    if (structural) bumpEpoch()
    scheduleSave(path, next)
  }

  const commitPrefab = (ref: string, next: PrefabJson, structural = false, coalesce?: string): void => {
    history.record(
      { kind: 'prefab', ref, before: prefabLib[ref] ?? null, after: next },
      coalesce ? `prefab:${ref}:${coalesce}` : undefined,
    )
    setPrefabLib((lib) => ({ ...lib, [ref]: next }))
    // Structural changes re-instantiate the stage; prop edits patch the live
    // instance instead (recreating the Game per input event is too costly).
    // Scene viewports remount on view switch, so they pick up the data too.
    if (structural) bumpEpoch()
    persistence.schedule(`prefab:${ref}`, () => savePrefab(fs, ref, next))
  }

  /** Keystroke-driven (Monaco): bursts on the same piece merge into one step. */
  const commitUi = (name: string, html: string): void => {
    history.record({ kind: 'ui', name, before: uiLib[name] ?? null, after: html }, `ui:${name}`)
    setUiLib((lib) => ({ ...lib, [name]: html }))
    persistence.schedule(`ui:${name}`, () => saveUi(fs, name, html))
  }

  return { commit, scheduleSave, commitPrefab, commitUi, bumpEpoch }
}
