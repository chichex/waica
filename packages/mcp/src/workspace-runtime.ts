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
 * A checkout exports workspace TS for Vite, while plain Node must consume the
 * freshly built dist graph. Published installs already expose dist and need no
 * hook. This bridge only activates when the CLI itself lives in this repo.
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

  const moduleApi = await import('node:module')
  if (typeof moduleApi.registerHooks === 'function') {
    workspaceHooks = moduleApi.registerHooks({
      resolve(specifier, _context, nextResolve) {
        const mapped = mappings[specifier]
        return mapped ? { url: mapped, shortCircuit: true } : nextResolve(specifier)
      },
    })
    return
  }
  moduleApi.register(new URL('./workspace-loader.js', import.meta.url), {
    parentURL: import.meta.url,
    data: mappings,
  })
}
