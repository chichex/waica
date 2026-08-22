import { access, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { KNOWN_ARCHETYPES } from './known-archetypes.js'
import { workspacePackageRoot } from './workspace-runtime.js'

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

/** A declared package that is absent from both the project and MCP bundle. */
export class PackageUnavailableError extends Error {
  constructor(readonly packageName: string) {
    super(`Package ${packageName} is not installed and is not part of the MCP bundle.`)
    this.name = 'PackageUnavailableError'
  }
}

const BUNDLED_SPECIFIERS = new Set([
  '@waica/engine',
  '@waica/behaviors',
  ...KNOWN_ARCHETYPES.flatMap(({ packageName }) => [packageName, `${packageName}/manifest`]),
])

const requireBundled = createRequire(import.meta.url)

/** Node resolution anchored at a game project rather than the MCP host process. */
export function projectAnchoredRequire(projectPath: string): NodeJS.Require {
  return createRequire(path.join(projectPath, 'package.json'))
}
const BUILT_ENTRY_BY_SPECIFIER: Readonly<Record<string, string>> = {
  '@waica/engine': 'dist/index.js',
  '@waica/behaviors': 'dist/index.js',
  ...Object.fromEntries(
    KNOWN_ARCHETYPES.flatMap(({ packageName }) => [
      [packageName, 'dist/index.js'],
      [`${packageName}/manifest`, 'dist/manifest.js'],
    ]),
  ),
}

function specifierFor(packageName: string, subpath?: string): string {
  if (!subpath || subpath === '.') return packageName
  return `${packageName}/${subpath.replace(/^\.\//, '')}`
}

async function projectPackageJsonUsable(projectPath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(projectPath, 'package.json'), 'utf8'),
    ) as unknown
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    if (error instanceof SyntaxError) return false
    throw error
  }
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

async function packageRootFromEntry(entry: string, packageName: string): Promise<string> {
  let current = path.dirname(entry)
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
    if (parent === current) throw new Error(`could not locate package root for ${packageName}`)
    current = parent
  }
}

async function bundledPackageRoot(packageName: string, specifier: string): Promise<string> {
  // In a built checkout the workspace copy is the bundle: the CLI's vendored
  // directory is a copy of it, and preferring the original keeps a
  // workspace-linked project recognisable as project-owned.
  const workspaceRoot = await workspacePackageRoot(packageName)
  if (workspaceRoot !== undefined) return workspaceRoot
  return packageRootFromEntry(requireBundled.resolve(specifier), packageName)
}

async function installedPackageRoot(
  projectPath: string,
  projectRequire: NodeJS.Require,
  packageName: string,
  specifier: string,
): Promise<string | undefined> {
  // Follow Node's ancestor node_modules search so hoisted installs count. A
  // physical candidate distinguishes an absent package from a present but
  // unloadable one; a successful resolution must point back to that candidate.
  for (let current = projectPath; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', ...packageName.split('/'))
    if (await exists(path.join(candidate, 'package.json'))) {
      let entry: string
      try {
        entry = projectRequire.resolve(specifier)
      } catch {
        return candidate
      }
      const resolvedRoot = await packageRootFromEntry(entry, packageName)
      if (!(await samePackage(candidate, resolvedRoot))) {
        throw new Error(
          `${specifier} resolved outside its installed package root ${candidate}: ${resolvedRoot}`,
        )
      }
      return candidate
    }
    const parent = path.dirname(current)
    if (parent === current) return undefined
  }
}

/**
 * A built checkout and a published package both carry loadable dist files.
 * Vitest runs buildless, so its literal-import fallback still consumes the
 * workspace source through Vite without changing production resolution.
 */
async function loadBundledModule(
  specifier: string,
  packageRoot: string,
): Promise<Record<string, unknown>> {
  const builtRelative = BUILT_ENTRY_BY_SPECIFIER[specifier]
  if (builtRelative) {
    const builtEntry = path.join(packageRoot, builtRelative)
    if (await exists(builtEntry)) return import(pathToFileURL(builtEntry).href)
  }
  switch (specifier) {
    case '@waica/engine':
      return import('@waica/engine')
    case '@waica/behaviors':
      return import('@waica/behaviors')
    case '@waica/archetype-platformer':
      return import('@waica/archetype-platformer')
    case '@waica/archetype-platformer/manifest':
      return import('@waica/archetype-platformer/manifest')
    case '@waica/archetype-topdown':
      return import('@waica/archetype-topdown')
    case '@waica/archetype-topdown/manifest':
      return import('@waica/archetype-topdown/manifest')
    case '@waica/archetype-isometric':
      return import('@waica/archetype-isometric')
    case '@waica/archetype-isometric/manifest':
      return import('@waica/archetype-isometric/manifest')
    default:
      throw new PackageUnavailableError(specifier)
  }
}

export function causeText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as NodeJS.ErrnoException).code
  return `${code ? `${code}: ` : ''}${error.message}`
}

async function samePackage(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b))
  } catch {
    return false
  }
}

/**
 * Resolves runtime answers from a game project's real Node installation.
 * Resolution is anchored with createRequire so hoisted installs count as
 * project-owned. A present package that Node cannot load is surfaced and is
 * never silently replaced with another version.
 */
export class PackageResolver {
  private readonly projectRequire?: NodeJS.Require
  private readonly projectManifestUsable?: Promise<boolean>

  constructor(readonly projectPath?: string) {
    if (projectPath) {
      this.projectRequire = projectAnchoredRequire(projectPath)
      this.projectManifestUsable = projectPackageJsonUsable(projectPath)
    }
  }

  async load<T = Record<string, unknown>>(
    packageName: string,
    subpath?: string,
  ): Promise<LoadedPackage<T>> {
    const specifier = specifierFor(packageName, subpath)
    const projectRoot =
      this.projectPath &&
      this.projectRequire &&
      (await this.projectManifestUsable)
        ? await installedPackageRoot(
            this.projectPath,
            this.projectRequire,
            packageName,
            specifier,
          )
        : undefined
    if (projectRoot && this.projectRequire) {
      let version = '(unknown version)'
      try {
        version = await packageVersion(projectRoot)
        let loaded: T
        try {
          loaded = this.projectRequire(specifier) as T
        } catch (error) {
          // The repository's pre-publish workspace links intentionally export
          // TS source to bundlers. Once the checkout is built, the CLI's
          // workspace runtime hook makes the same physical package loadable
          // from dist without weakening errors for arbitrary broken installs.
          const bundledRoot = BUNDLED_SPECIFIERS.has(specifier)
            ? await bundledPackageRoot(packageName, specifier)
            : undefined
          if (!bundledRoot || !(await samePackage(projectRoot, bundledRoot))) throw error
          loaded = (await loadBundledModule(specifier, bundledRoot)) as T
        }
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

    if (!BUNDLED_SPECIFIERS.has(specifier)) throw new PackageUnavailableError(packageName)
    try {
      const packageRoot = await bundledPackageRoot(packageName, specifier)
      const version = await packageVersion(packageRoot)
      return {
        module: (await loadBundledModule(specifier, packageRoot)) as T,
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
  return [`Mixed @waica package sources: ${describe('project')}; ${describe('bundled')}.`]
}
