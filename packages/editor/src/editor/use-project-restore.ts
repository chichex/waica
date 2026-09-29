import { useEffect, useEffectEvent, useRef } from 'react'
import type { PrefabJson } from '@waica/engine'
import type { ProjectFS } from '../fs/project-fs'
import { listScenes, loadPrefabLib } from '../fs/prefab-fs'
import { loadUiLib } from '../fs/ui-fs'
import { resolveArchetype } from '../project/archetype'
import { COMPONENTS_DIR, listComponentFiles } from '../project/components'
import { CONTROLS_PATH } from '../project/controls'
import { EDITOR_SETTINGS_PATH } from '../project/editor-settings'
import { GAME_PATH, parseGameSettings } from '../project/game'
import { loadComponentCode } from '../project/play-code'
import { STATS_PATH } from '../project/stats'
import { listRoleFiles, listStateFiles, ROLES_DIR, STATES_DIR } from '../project/states'
import { reportRejection } from '../report-rejection'
import type { ExplorerView } from './Explorer'
import * as playRunner from './play-runner'
import type { LoadedCode } from './use-project-code'
import type { LoadedSettings } from './use-project-settings'
import { loadWorkspace, saveWorkspace, type WorkspaceView } from './workspace'

/** Everything the editor reads from a project when it opens. */
export interface LoadedProject {
  scenePaths: string[]
  prefabs: Record<string, PrefabJson>
  ui: Record<string, string>
  code: LoadedCode
  settings: LoadedSettings
  /** Where the user left off, minus whatever no longer exists. */
  workspace: { openScenePath: string | null; view: WorkspaceView | null }
}

type ReadResult = { ok: true; project: LoadedProject } | { ok: false; message: string }

export interface RestoreHandlers {
  onLoaded: (project: LoadedProject) => void
  onFailed: (message: string) => void
}

/**
 * Reads the project when the editor opens (or switches project) and reopens
 * the workspace saved for it; from then on every view/scene move lands in
 * localStorage, so a reload comes back to the same place.
 */
export function useProjectRestore(
  fs: ProjectFS,
  workspace: { openScenePath: string | null; view: ExplorerView | null },
  handlers: RestoreHandlers,
): void {
  /** Guards the workspace-persist effect until the saved one is restored. */
  const workspaceRestored = useRef(false)
  const onLoaded = useEffectEvent((project: LoadedProject) => handlers.onLoaded(project))
  const onFailed = useEffectEvent((message: string) => handlers.onFailed(message))
  /**
   * The latest load. Loading project code mutates process-wide state (Monaco
   * shadow models keyed by path, the previous run's module URLs), so a run
   * starts only after the one before it settled, and one already cancelled
   * by then (StrictMode's setup, cleanup, setup) never starts at all.
   */
  const lastLoad = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    workspaceRestored.current = false
    let stale = false
    const previous = lastLoad.current
    const load = (async () => {
      await previous
      if (stale) return
      const result = await readProject(fs)
      if (stale) return
      if (!result.ok) {
        onFailed(result.message)
        return
      }
      for (const { path, message } of result.project.code.projectCode.errors) {
        console.error(`[waica] Project could not run ${path}: ${message}`)
      }
      onLoaded(result.project)
      workspaceRestored.current = true
    })()
    // A rejected load is reported below; the next one must still start.
    lastLoad.current = load.catch(() => {})
    reportRejection(load, 'restore project and workspace')
    return () => {
      stale = true
    }
  }, [fs])

  const { openScenePath, view } = workspace
  useEffect(() => {
    if (!workspaceRestored.current) return
    saveWorkspace(fs.name, openScenePath, view)
  }, [fs, openScenePath, view])
}

async function readProject(fs: ProjectFS): Promise<ReadResult> {
  const [paths, prefabs, ui, components, states, roles, controlsText, statsText, gameText, editorText] =
    await Promise.all([
      listScenes(fs),
      loadPrefabLib(fs),
      loadUiLib(fs),
      listComponentFiles(fs),
      listStateFiles(fs),
      listRoleFiles(fs),
      fs.readText(CONTROLS_PATH),
      fs.readText(STATS_PATH),
      fs.readText(GAME_PATH),
      fs.readText(EDITOR_SETTINGS_PATH),
    ])
  const game = parseGameSettings(gameText)
  let archetype
  try {
    archetype = resolveArchetype(game.archetype)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const projectCode = await loadComponentCode(fs, playRunner, archetype.bundle, archetype.animation ?? null)
  const code = { archetype, projectCode, components, states, roles }
  return {
    ok: true,
    project: {
      scenePaths: paths,
      prefabs,
      ui,
      code,
      settings: { controlsText, statsText, editorText, game, bindings: archetype.bindings },
      workspace: restoredWorkspace(fs.name, { paths, prefabs, ui, code }),
    },
  }
}

/** The saved workspace of `project`, dropping a scene or view that no longer exists. */
function restoredWorkspace(
  project: string,
  loaded: Pick<LoadedProject, 'prefabs' | 'ui' | 'code'> & { paths: string[] },
): LoadedProject['workspace'] {
  const saved = loadWorkspace(project)
  if (!saved) return { openScenePath: null, view: null }
  const { code } = loaded
  const codeFiles = new Set([
    ...code.components.map((name) => `${COMPONENTS_DIR}/${name}`),
    ...code.states.map((name) => `${STATES_DIR}/${name}`),
    ...code.roles.map((name) => `${ROLES_DIR}/${name}`),
  ])
  const viewExists = (v: WorkspaceView): boolean => {
    switch (v.kind) {
      case 'scene':
        return loaded.paths.includes(v.path)
      case 'prefab':
        return v.ref in loaded.prefabs
      case 'ui':
        return v.name in loaded.ui
      case 'stateFile':
      case 'componentFile':
        return codeFiles.has(v.path)
      case 'script':
      case 'controls':
      case 'stats':
      case 'game':
        // These always resolve.
        return true
    }
  }
  const openScenePath =
    saved.openScenePath && loaded.paths.includes(saved.openScenePath) ? saved.openScenePath : null
  return { openScenePath, view: saved.view && viewExists(saved.view) ? saved.view : null }
}
