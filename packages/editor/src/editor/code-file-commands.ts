import { scaffoldComponentFile } from '../project/components'
import {
  listRoleFiles,
  listStateFiles,
  roleFilePath,
  roleFileTemplate,
  stateFilePath,
  stateFileTemplate,
} from '../project/states'
import type { EditorCore } from './editor-commits'

/** The project's code files: scaffolding them and re-running component code. */

/** Re-executes project components after a scaffold or CodePane save. */
export async function refreshComponentCode(core: EditorCore): Promise<void> {
  await core.code.run('components')
  // Existing viewport entities own the previous class identities.
  core.bumpEpoch()
}

/** Scaffolds src/components/<name>.ts without replacing user code. */
export async function createComponentFile(core: EditorCore): Promise<void> {
  const name = window.prompt('Component name', 'MyComponent')
  if (name == null) return
  try {
    const { path } = await scaffoldComponentFile(core.fs, name)
    core.view.openView({ kind: 'componentFile', path })
    await refreshComponentCode(core)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error))
  }
}

/** Scaffolds src/states/<state>.ts (never overwrites) and refreshes the list. */
export async function createStateFile(core: EditorCore, role: string, state: string): Promise<void> {
  const path = stateFilePath(state)
  const existing = await core.fs.readText(path)
  if (existing == null) await core.fs.writeText(path, stateFileTemplate(role, state))
  core.code.setStateFiles(await listStateFiles(core.fs))
}

/** Scaffolds src/roles/<role>.ts (never overwrites) and opens it in Monaco. */
export async function createRoleFile(core: EditorCore, role: string): Promise<void> {
  const path = roleFilePath(role)
  const existing = await core.fs.readText(path)
  if (existing == null) await core.fs.writeText(path, roleFileTemplate(role))
  core.code.setRoleFiles(await listRoleFiles(core.fs))
  core.view.openView({ kind: 'stateFile', path })
}
