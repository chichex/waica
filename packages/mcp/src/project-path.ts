import { access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export interface ToolErrorBody {
  code: string
  message: string
  projectPath: string
  reason?: string
  available?: string[]
}

export class WaicaToolError extends Error {
  constructor(readonly body: ToolErrorBody) {
    super(body.message)
    this.name = 'WaicaToolError'
  }
}

export const ABSOLUTE_PATH_MESSAGE =
  "project_path must be absolute because a stdio server's working directory belongs to the agent host, not the game project."

export function assertAbsoluteProjectPath(projectPath: string): void {
  if (!path.isAbsolute(projectPath)) {
    throw new WaicaToolError({
      code: 'absolute-project-path-required',
      message: ABSOLUTE_PATH_MESSAGE,
      projectPath,
    })
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export interface ProjectCheck {
  notes: string[]
}

/** Enforces the common file-project boundary used by every non-create tool. */
export async function requireWaicaProject(projectPath: string): Promise<ProjectCheck> {
  assertAbsoluteProjectPath(projectPath)
  let info
  try {
    info = await stat(projectPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw cannotOperate(projectPath, 'missing-path', `Project path does not exist: ${projectPath}`)
    }
    throw error
  }
  if (!info.isDirectory()) {
    throw cannotOperate(projectPath, 'not-directory', `Project path is not a directory: ${projectPath}`)
  }
  const gameMarker = await exists(path.join(projectPath, 'src/game.json'))
  const sceneMarker = await exists(path.join(projectPath, 'src/scenes/main.scene.json'))
  if (!gameMarker && !sceneMarker) {
    throw cannotOperate(
      projectPath,
      'not-waica-project',
      'Not a Waica project: expected src/game.json or src/scenes/main.scene.json.',
    )
  }
  const notes: string[] = []
  if (!gameMarker) notes.push('Project marker src/game.json is missing; main.scene.json was accepted.')
  if (!sceneMarker) {
    notes.push('Project marker src/scenes/main.scene.json is missing; src/game.json was accepted.')
  }
  return { notes }
}

export function cannotOperate(
  projectPath: string,
  reason: string,
  message: string,
): WaicaToolError {
  return new WaicaToolError({
    code: 'cannot-operate',
    message,
    projectPath,
    reason,
  })
}

export async function directFiles(directory: string, suffix?: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export function assertSafeSlug(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`${label} must use letters, numbers, hyphens or underscores and cannot contain a path.`)
  }
}
