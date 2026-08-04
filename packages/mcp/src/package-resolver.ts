import * as BUNDLED_PLATFORMER from '@waica/archetype-platformer/manifest'
import * as BUNDLED_BEHAVIORS from '@waica/behaviors'
import * as BUNDLED_ENGINE from '@waica/engine'
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

export type PackageSource = 'project' | 'bundled'

export interface Provenance {
  package: string
  version: string
  source: PackageSource
}

export interface LoadedPackage<T = Record<string, unknown>> {
  module: T
  packageRoot: string
  provenance: Provenance
}

const bundledModules: Readonly<Record<string, Record<string, unknown>>> = {
  '@waica/engine': BUNDLED_ENGINE,
  '@waica/behaviors': BUNDLED_BEHAVIORS,
  '@waica/archetype-platformer/manifest': BUNDLED_PLATFORMER,
}

const requireBundled = createRequire(import.meta.url)

function specifierFor(packageName: string, subpath?: string): string {
  if (!subpath || subpath === '.') return packageName
  return `${packageName}/${subpath.replace(/^\.\//, '')}`
}

async function packageVersion(packageRoot: string): Promise<string> {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof manifest.version !== 'string') {
    throw new Error(`package at ${packageRoot} has no string version`)
  }
  return manifest.version
}

async function bundledPackageRoot(packageName: string, specifier: string): Promise<string> {
  let current = path.dirname(requireBundled.resolve(specifier))
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(path.join(current, 'package.json'), 'utf8')) as {
        name?: unknown
      }
      if (manifest.name === packageName) return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`could not locate bundled package ${packageName}`)
    current = parent
  }
}

function causeText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as NodeJS.ErrnoException).code
  return `${code ? `${code}: ` : ''}${error.message}`
}

/**
 * Resolves runtime answers from a game project's real Node installation.
 * A package physically present in project/node_modules is loaded with
 * createRequire anchored in that project; failures are surfaced and never
 * replaced with a bundled copy.
 */
export class PackageResolver {
  private readonly projectRequire?: NodeJS.Require

  constructor(readonly projectPath?: string) {
    if (projectPath) this.projectRequire = createRequire(path.join(projectPath, 'package.json'))
  }

  async load<T = Record<string, unknown>>(
    packageName: string,
    subpath?: string,
  ): Promise<LoadedPackage<T>> {
    const specifier = specifierFor(packageName, subpath)
    const projectRoot = this.projectPath
      ? path.join(this.projectPath, 'node_modules', ...packageName.split('/'))
      : undefined
    if (projectRoot && (await exists(projectRoot))) {
      let version = '(unknown version)'
      try {
        version = await packageVersion(projectRoot)
        const loaded = this.projectRequire?.(specifier) as T
        return {
          module: loaded,
          packageRoot: projectRoot,
          provenance: { package: packageName, version, source: 'project' },
        }
      } catch (error) {
        throw new Error(
          `Cannot load ${packageName} ${version} from the project: ${causeText(error)}`,
          { cause: error },
        )
      }
    }

    const module = bundledModules[specifier]
    if (!module) throw new Error(`The MCP bundle does not contain ${specifier}`)
    try {
      const packageRoot = await bundledPackageRoot(packageName, specifier)
      const version = await packageVersion(packageRoot)
      return {
        module: module as T,
        packageRoot,
        provenance: { package: packageName, version, source: 'bundled' },
      }
    } catch (error) {
      throw new Error(`Cannot load bundled ${packageName}: ${causeText(error)}`, { cause: error })
    }
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

/** Stable, de-duplicated rows in first-resolution order. */
export function provenanceRows(loads: ReadonlyArray<LoadedPackage<unknown>>): Provenance[] {
  const rows = new Map<string, Provenance>()
  for (const loaded of loads) {
    if (!rows.has(loaded.provenance.package)) {
      rows.set(loaded.provenance.package, loaded.provenance)
    }
  }
  return [...rows.values()]
}

/** Makes per-package fallback visible whenever an answer mixes sources. */
export function mixedSourceWarnings(rows: readonly Provenance[]): string[] {
  if (new Set(rows.map((row) => row.source)).size < 2) return []
  const describe = (source: PackageSource): string => {
    const names = rows.filter((row) => row.source === source).map((row) => row.package)
    return `${names.join(', ')} from ${source === 'project' ? 'the project' : 'the MCP bundle'}`
  }
  return [
    `Mixed @waica package sources: ${describe('project')}; ${describe('bundled')}.`,
  ]
}
