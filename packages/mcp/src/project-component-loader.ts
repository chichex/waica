import type { ComponentClass, ParamSpec } from '@waica/engine'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { classDefaults, objectRecord } from './component-metadata.js'
import { causeText, PackageResolver, projectAnchoredRequire } from './package-resolver.js'
import { directFiles } from './project-path.js'

const { createRequire } = nodeModule

export type ComponentLoadFailureCode =
  | 'component-load-failed'
  | 'component-load-unsupported'

export interface ProjectComponentDescription {
  file: string
  Class: ComponentClass
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
}

export interface ComponentLoadFailure {
  code: ComponentLoadFailureCode
  file: string
  message: string
}

export interface ProjectComponentLoadResult {
  components: Record<string, ProjectComponentDescription>
  failures: ComponentLoadFailure[]
}

interface HookContext {
  projectRequire: NodeJS.Require
  packageBridges: Map<string, string>
}

// Two independent identifiers travel on every module URL this loader hands
// out: PROJECT_PARAM routes a resolve-hook call back to the validation run
// that started it (an ephemeral, in-memory lookup, cleaned up per run), and
// LOAD_PARAM is a content hash that only changes when the file's own bytes
// change. Splitting them is what lets re-validating unchanged files reuse
// Node's module cache instead of pinning a fresh entry on every run (see
// loadProjectComponents below).
const PROJECT_PARAM = 'waica-component-project'
const LOAD_PARAM = 'waica-component-load'
const hookContexts = new Map<string, HookContext>()

type NativeImport = (specifier: string) => Promise<Record<string, unknown>>

// Loading this tiny CommonJS trampoline through Node keeps Vitest from
// rewriting fixture imports. The build copies the same file byte-for-byte.
const nativeImport = createRequire(import.meta.url)('./native-import.cjs') as NativeImport

const MODULE_HOOKS_MIN_NODE = '22.15'

/** Pure so it can be exercised directly, independent of the running Node. */
export function nodeSupportsModuleHooks(
  moduleApi: { registerHooks?: unknown } = nodeModule,
): boolean {
  return typeof moduleApi.registerHooks === 'function'
}

/**
 * `node:module`'s `registerHooks` landed in Node 22.15; this MCP server is
 * still expected to start (and serve every other tool) on the older Node
 * hosts an agent may be running. A static named import of `registerHooks`
 * would fail ESM linking on those hosts before the transport ever connects
 * (see workspace-runtime.ts for the same guard on the same API), so this is
 * a namespace import feature-checked at runtime instead.
 */
const hooksSupported = nodeSupportsModuleHooks()

/** The single finding emitted in place of real component loading on a host too old for module hooks. */
export function unsupportedNodeFailure(nodeVersion: string = process.version): ComponentLoadFailure {
  return {
    code: 'component-load-unsupported',
    file: 'src',
    message:
      `Deep component validation requires Node >= ${MODULE_HOOKS_MIN_NODE} (node:module registerHooks) ` +
      `to run project components, roles and states in-process; this host runs Node ${nodeVersion}. ` +
      'Skipping in-process module loading: component params and instance defaults from project code ' +
      'will not appear in validate_project or list_components until the host upgrades.',
  }
}

function runFromParent(parentURL: string | undefined): {
  token: string
  context: HookContext
} | undefined {
  if (!parentURL) return undefined
  try {
    const token = new URL(parentURL).searchParams.get(PROJECT_PARAM)
    const context = token ? hookContexts.get(token) : undefined
    return token && context ? { token, context } : undefined
  } catch {
    return undefined
  }
}

function versioned(url: URL, token: string, content: string): string {
  url.searchParams.set(PROJECT_PARAM, token)
  url.searchParams.set(LOAD_PARAM, content)
  return url.href
}

function projectToken(projectPath: string): string {
  return createHash('sha1').update(path.resolve(projectPath)).digest('hex').slice(0, 16)
}

/** Content identity for cache-busting: stable across runs, changes only when the file's bytes do. */
function contentToken(filePath: string): string {
  try {
    return createHash('sha1').update(readFileSync(filePath)).digest('hex').slice(0, 16)
  } catch {
    // The subsequent import attempt reports the real read/import error; this
    // token only needs to exist so versioned() has something to stamp.
    return 'unreadable'
  }
}

const RELATIVE_EXTENSIONS = ['.ts', '.tsx', '.js']

/** Mirrors the editor's resolveProjectImport (play-code.ts): direct, direct+ext, direct/index+ext. */
function relativeCandidates(unresolvedPath: string): string[] {
  const candidates = [
    ...RELATIVE_EXTENSIONS.map((extension) => `${unresolvedPath}${extension}`),
    ...RELATIVE_EXTENSIONS.map((extension) => path.join(unresolvedPath, `index${extension}`)),
  ]
  if (unresolvedPath.endsWith('.js')) {
    const withoutJs = unresolvedPath.slice(0, -'.js'.length)
    candidates.unshift(`${withoutJs}.ts`, `${withoutJs}.tsx`)
  }
  return candidates
}

function resolveRelativeCandidate(unresolvedPath: string): string | undefined {
  return relativeCandidates(unresolvedPath).find((candidate) => existsSync(candidate))
}

// The synchronous hook is process-wide, but it is inert for imports that were
// not initiated by this loader. The PROJECT_PARAM token selects the project
// resolver for a given run; nextResolve is always tried first so real Node
// resolution (package "exports" maps, symlinks, literal existing paths) stays
// authoritative, and our TypeScript-project conventions are only a fallback.
if (hooksSupported) {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const run = runFromParent(context.parentURL)
      if (!run) return nextResolve(specifier, context)

      if (specifier.startsWith('@waica/')) {
        const bridge = run.context.packageBridges.get(specifier)
        if (bridge) return { url: bridge, shortCircuit: true }
        const resolved = run.context.projectRequire.resolve(specifier)
        const url = pathToFileURL(resolved)
        return {
          url: /\.tsx?$/.test(resolved)
            ? versioned(url, run.token, contentToken(resolved))
            : url.href,
          shortCircuit: true,
        }
      }

      if (specifier.startsWith('.')) {
        const unresolved = new URL(specifier, context.parentURL)
        let resolvedURL: URL
        try {
          resolvedURL = new URL(nextResolve(specifier, context).url)
        } catch (error) {
          // Directory imports (./lib -> ./lib/index.ts) and multi-dot
          // specifiers (./foo.helper -> ./foo.helper.ts) are valid under the
          // project's moduleResolution "bundler" and run fine in Vite, but
          // Node's default resolver rejects both — fall back to the same
          // candidates the editor tries before giving up.
          const fallback = resolveRelativeCandidate(fileURLToPath(unresolved))
          if (!fallback) throw error
          resolvedURL = pathToFileURL(fallback)
        }
        const resolvedPath = fileURLToPath(resolvedURL)
        return {
          url: versioned(resolvedURL, run.token, contentToken(resolvedPath)),
          shortCircuit: true,
        }
      }

      return nextResolve(specifier, context)
    },
  })
}

function componentDescriptions(
  module: Record<string, unknown>,
  file: string,
): Record<string, ProjectComponentDescription> {
  const descriptions: Record<string, ProjectComponentDescription> = {}
  for (const value of Object.values(module)) {
    if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) continue
    const Class = value as unknown as {
      new (): object
      componentName?: unknown
      params?: unknown
    }
    if (typeof Class.componentName !== 'string' || !Class.componentName) continue
    descriptions[Class.componentName] = {
      file,
      Class: Class as unknown as ComponentClass,
      params: objectRecord(Class.params) as Record<string, ParamSpec>,
      defaults: classDefaults(Class),
    }
  }
  return descriptions
}

function errorChain(error: unknown): Error[] {
  const errors: Error[] = []
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Error && !seen.has(current)) {
    errors.push(current)
    seen.add(current)
    current = current.cause
  }
  return errors
}

function unsupportedByNode(error: unknown): boolean {
  for (const candidate of errorChain(error)) {
    const code = (candidate as NodeJS.ErrnoException).code
    if (
      code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
      code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'
    ) {
      return true
    }
    if (
      /not supported in strip-only mode|unsupported TypeScript syntax|unknown file extension/i.test(
        candidate.message,
      )
    ) {
      return true
    }
  }
  return false
}

function bridgeModule(
  token: string,
  specifier: string,
  module: Record<string, unknown>,
): { key: string; url: string } {
  const key = `waica.project-component.${process.pid}.${token}.${specifier}`
  Reflect.set(process, Symbol.for(key), module)
  const exports = Object.keys(module).filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name))
  const lines = [
    `const value = process[Symbol.for(${JSON.stringify(key)})]`,
    `if (!value) throw new Error(${JSON.stringify(`Missing package bridge for ${specifier}`)})`,
  ]
  let index = 0
  for (const name of exports) {
    if (name === 'default') {
      lines.push('export default value.default')
      continue
    }
    const binding = `binding${index++}`
    lines.push(
      `const ${binding} = value[${JSON.stringify(name)}]`,
      `export { ${binding} as ${name} }`,
    )
  }
  return {
    key,
    url: `data:text/javascript;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`,
  }
}

const BRIDGED_SPECIFIERS = ['@waica/engine', '@waica/behaviors', '@waica/archetype-platformer'] as const

async function packageBridges(
  projectPath: string,
  token: string,
  // Defaults to a fresh resolver for standalone callers (e.g. tests); the
  // real loadProjectComponents call site reuses validateProject's resolver
  // so these packages are not re-resolved from scratch a second time.
  resolver: PackageResolver = new PackageResolver(projectPath),
): Promise<{ urls: Map<string, string>; keys: string[] }> {
  // @waica/archetype-platformer joins engine/behaviors here (not just the
  // separate projectRequire.resolve path below) so a freshly created,
  // not-yet-installed project still gets the MCP-bundled copy the same way
  // it already does for engine/behaviors, instead of a bare MODULE_NOT_FOUND.
  // The three packages are independent, so they load concurrently.
  const bridges = await Promise.all(
    BRIDGED_SPECIFIERS.map(async (specifier) => {
      try {
        const loaded = await resolver.load<Record<string, unknown>>(specifier)
        // Keyed by the resolved package's own version rather than a per-run
        // counter, so re-validating without a dependency bump reuses the exact
        // same data: URL — and therefore Node's already-cached module for it —
        // instead of pinning a fresh, functionally identical one every run.
        const bridge = bridgeModule(`${token}:${loaded.provenance.version}`, specifier, loaded.module)
        return { specifier, bridge }
      } catch {
        // The importing project file receives the anchored resolver's real error.
        return undefined
      }
    }),
  )
  const urls = new Map<string, string>()
  const keys: string[] = []
  for (const entry of bridges) {
    if (!entry) continue
    urls.set(entry.specifier, entry.bridge.url)
    keys.push(entry.bridge.key)
  }
  return { urls, keys }
}

async function projectModuleFiles(projectPath: string): Promise<string[]> {
  const groups = await Promise.all(
    ['components', 'roles', 'states'].map(async (directory) =>
      (await directFiles(path.join(projectPath, 'src', directory), '.ts')).map(
        (file) => `src/${directory}/${file}`,
      ),
    ),
  )
  return groups.flat()
}

/**
 * Executes every project-owned component/role/state module independently.
 * Failures are returned as data so one bad file cannot abort validation.
 */
export async function loadProjectComponents(
  projectPath: string,
  resolver?: PackageResolver,
): Promise<ProjectComponentLoadResult> {
  if (!hooksSupported) {
    return { components: {}, failures: [unsupportedNodeFailure()] }
  }
  const token = projectToken(projectPath)
  const bridges = await packageBridges(projectPath, token, resolver)
  hookContexts.set(token, {
    projectRequire: projectAnchoredRequire(projectPath),
    packageBridges: bridges.urls,
  })
  const components: Record<string, ProjectComponentDescription> = {}
  const failures: ComponentLoadFailure[] = []
  try {
    for (const relative of await projectModuleFiles(projectPath)) {
      const file = path.join(projectPath, relative)
      try {
        const entryHref = versioned(pathToFileURL(file), token, contentToken(file))
        const module = await nativeImport(entryHref)
        Object.assign(components, componentDescriptions(module, relative))
      } catch (error) {
        failures.push({
          code: unsupportedByNode(error) ? 'component-load-unsupported' : 'component-load-failed',
          file: relative,
          message: causeText(error),
        })
      }
    }
  } finally {
    hookContexts.delete(token)
    for (const key of bridges.keys) Reflect.deleteProperty(process, Symbol.for(key))
  }
  return { components, failures }
}
