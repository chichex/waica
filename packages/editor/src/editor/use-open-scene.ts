import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { SceneJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import { reportRejection } from '../report-rejection'
import * as ops from '../scene/ops'
import { parseSceneJson } from '../scene/scene-file'

/** A scene as displayed, with the file it came from. */
export interface LoadedScene {
  path: string
  scene: SceneJson
}

/** The scene file the editor has open, and the scene it shows. */
export interface OpenScene {
  /** The scene file picked in the chrome (breadcrumb, title, scene picker). */
  openScenePath: string | null
  /** Opens another scene file; null closes it. */
  setOpenScenePath: (path: string | null) => void
  /**
   * The scene in the viewport, paired with the file it came from. The two
   * travel together for two reasons: an edit is never written to a path the
   * displayed scene did not come from, and opening another scene keeps the
   * Viewport mounted. Blanking the scene while the next file reads would
   * swap the Viewport for a hint <div>, which unmounts it and rebuilds the
   * Game — exactly what loading over the same Game (ADR 0011) exists to avoid.
   */
  openScene: LoadedScene | null
  setOpenScene: Dispatch<SetStateAction<LoadedScene | null>>
  scene: SceneJson | null
  loadedScenePath: string | null
  /**
   * Another scene file was picked and is still being read, so what is on
   * screen is not what the chrome (breadcrumb, title, scene picker) names.
   * Mutating during that window would write an edit into the file the user
   * just navigated away from, and starting Play would run the outgoing scene
   * under the incoming one's name.
   */
  sceneSwitching: boolean
  sceneFailed: boolean
}

export function useOpenScene(
  fs: ProjectFS,
  pendingScene: (path: string) => SceneJson | undefined,
): OpenScene {
  const [openScenePath, setPath] = useState<string | null>(null)
  const [openScene, setOpenScene] = useState<LoadedScene | null>(null)
  const [sceneFailed, setSceneFailed] = useState(false)
  const loadedScenePath = openScene?.path ?? null

  // Picking another scene clears a failed read at once, and a scene with a
  // write still pending shows that content straight away: it is newer than
  // the file on disk. Deliberately NOT blanking the scene otherwise: the
  // previous one stays on screen (and stays editable, against its own path)
  // until the next file lands, so the Viewport is never unmounted mid-switch.
  const setOpenScenePath = (path: string | null): void => {
    setPath(path)
    if (path === null || path === openScenePath) return
    setSceneFailed(false)
    const pending = pendingScene(path)
    if (pending) setOpenScene({ path, scene: pending })
  }

  useEffect(() => {
    if (!openScenePath || pendingScene(openScenePath)) return
    const path = openScenePath
    let stale = false
    reportRejection(fs.readText(path).then((text) => {
      if (stale) return
      try {
        if (text == null) throw new Error('missing')
        setOpenScene({ path, scene: ops.migrateScene(parseSceneJson(text)) })
      } catch {
        setSceneFailed(true)
      }
    }), 'open scene')
    return () => {
      stale = true
    }
  }, [fs, openScenePath, pendingScene])

  return {
    openScenePath,
    setOpenScenePath,
    openScene,
    setOpenScene,
    scene: openScene?.scene ?? null,
    loadedScenePath,
    sceneSwitching: openScenePath !== null && loadedScenePath !== openScenePath,
    sceneFailed,
  }
}
