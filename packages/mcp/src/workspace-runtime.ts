import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_DIRECTORIES: Readonly<Record<string, string>> = {
  '@waica/engine': 'engine',
  '@waica/behaviors': 'behaviors',
  '@waica/archetype-platformer': 'archetype-platformer',
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

/**
 * Built workspace packages still import one another by bare package name while
 * checkout exports point at source TypeScript. Map only imports whose parent is
 * already inside one of those built dist trees. Project-anchored resolution is
 * deliberately outside this scope and therefore remains authoritative.
 */
export async function prepareWorkspaceRuntime(): Promise<void> {
  const repositoryRoot = await findWorkspaceRoot()
  if (repositoryRoot === undefined) return
  const files: Record<string, string> = {
    '@waica/engine': path.join(repositoryRoot, 'packages/engine/dist/index.js'),
    '@waica/behaviors': path.join(repositoryRoot, 'packages/behaviors/dist/index.js'),
    '@waica/archetype-platformer': path.join(
      repositoryRoot,
      'packages/archetype-platformer/dist/index.js',
    ),
    '@waica/archetype-platformer/manifest': path.join(
      repositoryRoot,
      'packages/archetype-platformer/dist/manifest.js',
    ),
  }
  if (!(await Promise.all(Object.values(files).map(exists))).every(Boolean)) return
  const mappings = Object.fromEntries(
    Object.entries(files).map(([specifier, file]) => [specifier, pathToFileURL(file).href]),
  )
  const parentPrefixes = ['engine', 'behaviors', 'archetype-platformer'].map(
    (directory) =>
      `${pathToFileURL(path.join(repositoryRoot, 'packages', directory, 'dist')).href}/`,
  )

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
