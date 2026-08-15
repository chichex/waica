import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { KNOWN_ARCHETYPES } from './known-archetypes.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_DIRECTORIES: Readonly<Record<string, string>> = {
  '@waica/engine': 'engine',
  '@waica/behaviors': 'behaviors',
  ...Object.fromEntries(
    KNOWN_ARCHETYPES.map(({ packageName, directory }) => [packageName, directory]),
  ),
}
let workspaceHooks: { deregister(): void } | undefined
let workspacePackages: Promise<Map<string, string>> | undefined

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * The server runs both from `packages/mcp/dist` and from the copy the waica CLI
 * bundles under its own `dist`, so the checkout root is searched for rather than
 * assumed at a fixed depth. An unrelated pnpm workspace is harmless: the built
 * engine files below are what actually gate the hook.
 */
async function findWorkspaceRoot(): Promise<string | undefined> {
  for (let current = here; ; current = path.dirname(current)) {
    if (await exists(path.join(current, 'pnpm-workspace.yaml'))) return current
    const parent = path.dirname(current)
    if (parent === current) return undefined
  }
}

async function isPackageNamed(packageRoot: string, packageName: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { name?: unknown }
    return manifest.name === packageName
  } catch {
    return false
  }
}

async function loadWorkspacePackages(): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const repositoryRoot = await findWorkspaceRoot()
  if (repositoryRoot === undefined) return found
  for (const [packageName, directory] of Object.entries(WORKSPACE_DIRECTORIES)) {
    const packageRoot = path.join(repositoryRoot, 'packages', directory)
    if (
      (await exists(path.join(packageRoot, 'dist/index.js'))) &&
      (await isPackageNamed(packageRoot, packageName))
    ) {
      found.set(packageName, packageRoot)
    }
  }
  return found
}

/**
 * The built checkout copy of a bundled package, when the server runs from this
 * repository. The waica CLI vendors its own copies under `dist`, so without
 * this a workspace-linked project would look like a mismatch against them
 * instead of like the very same package.
 */
export async function workspacePackageRoot(packageName: string): Promise<string | undefined> {
  workspacePackages ??= loadWorkspacePackages()
  return (await workspacePackages).get(packageName)
}

export interface WorkspaceRuntimePlan {
  /** Bare specifier → file URL of the built checkout entry. */
  mappings: Record<string, string>
  parentPrefixes: string[]
  /** One line per known archetype skipped for lack of a built dist. */
  warnings: string[]
}

/**
 * Which workspace mappings the runtime hook should install. Engine and
 * behaviors gate the whole plan — nothing loads without them — but each
 * archetype only gates itself: a missing archetype dist drops that
 * archetype's mappings with a warning instead of disabling every mapping.
 */
export async function planWorkspaceRuntime(
  repositoryRoot: string,
  fileExists: (target: string) => Promise<boolean> = exists,
): Promise<WorkspaceRuntimePlan | undefined> {
  const core: Record<string, string> = {
    '@waica/engine': path.join(repositoryRoot, 'packages/engine/dist/index.js'),
    '@waica/behaviors': path.join(repositoryRoot, 'packages/behaviors/dist/index.js'),
  }
  if (!(await Promise.all(Object.values(core).map(fileExists))).every(Boolean)) return undefined

  const files: Record<string, string> = { ...core }
  const directories = ['engine', 'behaviors']
  const warnings: string[] = []
  for (const { packageName, directory } of KNOWN_ARCHETYPES) {
    const index = path.join(repositoryRoot, 'packages', directory, 'dist/index.js')
    const manifest = path.join(repositoryRoot, 'packages', directory, 'dist/manifest.js')
    if ((await fileExists(index)) && (await fileExists(manifest))) {
      files[packageName] = index
      files[`${packageName}/manifest`] = manifest
      directories.push(directory)
    } else {
      warnings.push(
        `waica-mcp: workspace archetype ${packageName} has no built dist; its workspace mappings were skipped.`,
      )
    }
  }
  return {
    mappings: Object.fromEntries(
      Object.entries(files).map(([specifier, file]) => [specifier, pathToFileURL(file).href]),
    ),
    parentPrefixes: directories.map(
      (directory) =>
        `${pathToFileURL(path.join(repositoryRoot, 'packages', directory, 'dist')).href}/`,
    ),
    warnings,
  }
}

/**
 * Built workspace packages still import one another by bare package name while
 * checkout exports point at source TypeScript. Map only imports whose parent is
 * already inside one of those built dist trees. Project-anchored resolution is
 * deliberately outside this scope and therefore remains authoritative.
 */
export async function prepareWorkspaceRuntime(): Promise<void> {
  const repositoryRoot = await findWorkspaceRoot()
  if (repositoryRoot === undefined) return
  const plan = await planWorkspaceRuntime(repositoryRoot)
  if (plan === undefined) return
  for (const warning of plan.warnings) console.warn(warning)
  const { mappings, parentPrefixes } = plan

  const moduleApi = await import('node:module')
  if (typeof moduleApi.registerHooks === 'function') {
    workspaceHooks = moduleApi.registerHooks({
      resolve(specifier, context, nextResolve) {
        const mapped = mappings[specifier]
        const parentURL = context.parentURL
        const bundledParent =
          parentURL !== undefined && parentPrefixes.some((prefix) => parentURL.startsWith(prefix))
        return mapped && bundledParent
          ? { url: mapped, shortCircuit: true }
          : nextResolve(specifier, context)
      },
    })
    return
  }
  moduleApi.register(new URL('./workspace-loader.js', import.meta.url), {
    parentURL: import.meta.url,
    data: { mappings, parentPrefixes },
  })
}
