import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(here, '../../..')
let workspaceHooks: { deregister(): void } | undefined

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
 * Built workspace packages still import one another by bare package name while
 * checkout exports point at source TypeScript. Map only imports whose parent is
 * already inside one of those built dist trees. Project-anchored resolution is
 * deliberately outside this scope and therefore remains authoritative.
 */
export async function prepareWorkspaceRuntime(): Promise<void> {
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
