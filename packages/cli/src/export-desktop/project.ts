import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** A Project the export can build: its directory, package.json identity and parsed game.json. */
export interface DesktopProject {
  dir: string
  /** package.json `name`, unscoped; 'game' when it has none. */
  packageName: string
  /** package.json `version`; '0.0.0' when it has none. */
  version: string
  game: unknown
}

async function readJsonFile(file: string): Promise<unknown> {
  const raw = await readFile(file, 'utf8')
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed
  } catch (error) {
    throw new Error(`${file} is not valid JSON`, { cause: error })
  }
}

function stringField(value: unknown, field: string): string | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate: unknown = Reflect.get(value, field)
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate.trim() : null
}

/**
 * The preflight (CA-7): a directory with no src/game.json is not a Project,
 * and one with no node_modules cannot run its own `vite build`. Both stop
 * the export before anything is built.
 */
export async function readDesktopProject(directory: string): Promise<DesktopProject> {
  const dir = path.resolve(directory)
  const gameFile = path.join(dir, 'src', 'game.json')
  if (!existsSync(gameFile)) throw new Error(`not a waica project: ${dir}`)
  if (!existsSync(path.join(dir, 'node_modules'))) throw new Error(`run npm install in ${dir} first`)
  const pkgFile = path.join(dir, 'package.json')
  const pkg = existsSync(pkgFile) ? await readJsonFile(pkgFile) : {}
  const name = stringField(pkg, 'name')
  return {
    dir,
    packageName: name ? name.slice(name.lastIndexOf('/') + 1) : 'game',
    version: stringField(pkg, 'version') ?? '0.0.0',
    game: await readJsonFile(gameFile),
  }
}
