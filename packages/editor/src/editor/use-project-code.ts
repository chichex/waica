import { useCallback, useMemo, useState } from 'react'
import { mergeRegistryComponents, type ComponentClass } from '@waica/engine'
import { resolveArchetype, type ArchetypeManifest } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { installChassisArchetype } from '../project/chassis'
import { COMPONENTS_DIR, listComponentFiles } from '../project/components'
import { loadComponentCode, loadPlayCode, type PlayCodeResult } from '../project/play-code'
import * as playRunner from './play-runner'

/** What the project restore read for the code layer. */
export interface LoadedCode {
  archetype: ArchetypeManifest
  projectCode: PlayCodeResult
  components: string[]
  states: string[]
  roles: string[]
}

/**
 * The project's extension layer: its archetype and the code it adds on top —
 * component classes from src/components, plus the state and role files.
 */
export interface ProjectCode {
  archetype: ArchetypeManifest
  /** The archetype registry with the project's own components merged in. */
  editorArchetype: ArchetypeManifest
  /** The project's components for the Explorer: exported classes and class-less files. */
  customComponents: Array<{ name: string; path: string }>
  archetypeFailed: string | null
  /** Basenames in src/states/ — the project's state code files. */
  stateFiles: string[]
  /** Basenames in src/roles/ — the project's custom role files. */
  roleFiles: string[]
  /** Stable: installs what the project restore read. */
  hydrate: (loaded: LoadedCode) => void
  /** Stable: the project's archetype could not be resolved. */
  fail: (message: string) => void
  /**
   * Re-executes project code over a clean baseline: `components` for the
   * editor, `play` for components, states and roles before a Play run.
   */
  run: (scope: 'components' | 'play') => Promise<void>
  setStateFiles: (files: string[]) => void
  setRoleFiles: (files: string[]) => void
}

export function useProjectCode(fs: ProjectFS): ProjectCode {
  const [archetype, setArchetype] = useState<ArchetypeManifest>(defaultArchetype)
  const [archetypeFailed, setArchetypeFailed] = useState<string | null>(null)
  /** Component classes exported by src/components/*.ts. */
  const [projectComponents, setProjectComponents] = useState<Record<string, ComponentClass>>({})
  /** Exported component name → editable project source path. */
  const [componentPaths, setComponentPaths] = useState<Record<string, string>>({})
  /** Basenames in src/components/ — the project's component code files. */
  const [componentFiles, setComponentFiles] = useState<string[]>([])
  const [stateFiles, setStateFiles] = useState<string[]>([])
  const [roleFiles, setRoleFiles] = useState<string[]>([])

  const hydrate = useCallback((loaded: LoadedCode): void => {
    setComponentFiles(loaded.components)
    setProjectComponents(loaded.projectCode.components)
    setComponentPaths(loaded.projectCode.componentPaths)
    setStateFiles(loaded.states)
    setRoleFiles(loaded.roles)
    setArchetype(loaded.archetype)
  }, [])

  const run = async (scope: 'components' | 'play'): Promise<void> => {
    const { projectCode, files } = await executeProjectCode(fs, archetype, scope)
    setComponentFiles(files)
    setProjectComponents(projectCode.components)
    setComponentPaths(projectCode.componentPaths)
  }

  const editorArchetype = useMemo<ArchetypeManifest>(
    () => ({ ...archetype, registry: mergeRegistryComponents(archetype.registry, projectComponents) }),
    [archetype, projectComponents],
  )
  const customComponents = useMemo(
    () => listCustomComponents(componentPaths, componentFiles),
    [componentFiles, componentPaths],
  )

  return {
    archetype,
    editorArchetype,
    customComponents,
    archetypeFailed,
    stateFiles,
    roleFiles,
    hydrate,
    fail: setArchetypeFailed,
    run,
    setStateFiles,
    setRoleFiles,
  }
}

/** The default archetype, installed as the chassis until the project names its own. */
function defaultArchetype(): ArchetypeManifest {
  const initial = resolveArchetype()
  installChassisArchetype(initial.bundle, initial.animation ?? null)
  return initial
}

/** Runs project code over a clean baseline and lists the component files it came from. */
async function executeProjectCode(
  fs: ProjectFS,
  archetype: ArchetypeManifest,
  scope: 'components' | 'play',
): Promise<{ projectCode: PlayCodeResult; files: string[] }> {
  const load = scope === 'play' ? loadPlayCode : loadComponentCode
  const projectCode = await load(fs, playRunner, archetype.bundle, archetype.animation ?? null)
  const label = scope === 'play' ? 'Play' : 'Project'
  for (const { path, message } of projectCode.errors) {
    console.error(`[waica] ${label} could not run ${path}: ${message}`)
  }
  return { projectCode, files: await listComponentFiles(fs) }
}

function listCustomComponents(
  componentPaths: Record<string, string>,
  componentFiles: string[],
): Array<{ name: string; path: string }> {
  const exported = Object.entries(componentPaths).map(([name, path]) => ({ name, path }))
  const exportedPaths = new Set(exported.map(({ path }) => path))
  const filesWithoutClass = componentFiles
    .map((name) => ({ name: name.replace(/\.ts$/, ''), path: `${COMPONENTS_DIR}/${name}` }))
    .filter(({ path }) => !exportedPaths.has(path))
  return [...exported, ...filesWithoutClass].sort((a, b) => a.name.localeCompare(b.name))
}
