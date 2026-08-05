import type { ParamSpec } from '@waica/engine'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { projectAnchoredRequire } from './package-resolver.js'
import { directFiles } from './project-path.js'

export type ComponentLoadFailureCode =
  | 'component-load-failed'
  | 'component-load-unsupported'

export interface ProjectComponentDescription {
  file: string
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
}

const RUN_PARAM = 'waica-component-load'
const hookContexts = new Map<string, HookContext>()
let nextRun = 0

type NativeImport = (specifier: string) => Promise<Record<string, unknown>>

// Vitest runs source modules in a VM. Its test-only trampoline selects Node's
// main loader; the emitted MCP uses an ordinary native dynamic import.
const nativeImport: NativeImport = process.env.VITEST
  ? (new vm.Script('(specifier) => import(specifier)', {
      importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }).runInThisContext() as NativeImport)
  : (specifier) => import(specifier) as Promise<Record<string, unknown>>

function runFromParent(parentURL: string | undefined): {
  token: string
  context: HookContext
} | undefined {
  if (!parentURL) return undefined
  try {
    const token = new URL(parentURL).searchParams.get(RUN_PARAM)
    const context = token ? hookContexts.get(token) : undefined
    return token && context ? { token, context } : undefined
  } catch {
    return undefined
  }
}

function versioned(url: URL, token: string): string {
  url.searchParams.set(RUN_PARAM, token)
  return url.href
}

// The synchronous hook is process-wide, but it is inert for imports that were
// not initiated by this loader. A unique query token both selects the project
// resolver and gives each validation run fresh module-cache URLs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const run = runFromParent(context.parentURL)
    if (!run) return nextResolve(specifier, context)

    if (specifier.startsWith('@waica/')) {
      const resolved = run.context.projectRequire.resolve(specifier)
      return { url: pathToFileURL(resolved).href, shortCircuit: true }
    }

    if (specifier.startsWith('.')) {
      const unresolved = new URL(specifier, context.parentURL)
      const unresolvedPath = fileURLToPath(unresolved)
      if (path.extname(unresolvedPath) === '') {
        for (const extension of ['.ts', '.tsx', '.js']) {
          const candidate = new URL(unresolved)
          candidate.pathname += extension
          if (existsSync(fileURLToPath(candidate))) {
            return { url: versioned(candidate, run.token), shortCircuit: true }
          }
        }
      }
      const resolved = nextResolve(specifier, context)
      return { ...resolved, url: versioned(new URL(resolved.url), run.token) }
    }

    return nextResolve(specifier, context)
  },
})

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function ownDefaults(Class: new () => object): Record<string, unknown> {
  try {
    return Object.fromEntries(
      Object.entries(new Class()).filter(([, value]) => value !== undefined),
    )
  } catch {
    return {}
  }
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
      params: objectRecord(Class.params) as Record<string, ParamSpec>,
      defaults: ownDefaults(Class),
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

function failureMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as NodeJS.ErrnoException).code
  return `${code ? `${code}: ` : ''}${error.message}`
}

function unsupportedByNode(error: unknown, source: string): boolean {
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
  // Legacy decorators are valid to the project's Vite/TypeScript toolchain but
  // are intentionally not transformed by Node's strip-only loader.
  return /^\s*@[$\w]+/m.test(source)
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
): Promise<ProjectComponentLoadResult> {
  const token = String(++nextRun)
  hookContexts.set(token, { projectRequire: projectAnchoredRequire(projectPath) })
  const components: Record<string, ProjectComponentDescription> = {}
  const failures: ComponentLoadFailure[] = []
  try {
    for (const relative of await projectModuleFiles(projectPath)) {
      const file = path.join(projectPath, relative)
      const entry = pathToFileURL(file)
      entry.searchParams.set(RUN_PARAM, token)
      try {
        const module = await nativeImport(entry.href)
        Object.assign(components, componentDescriptions(module, relative))
      } catch (error) {
        const source = readFileSync(file, 'utf8')
        failures.push({
          code: unsupportedByNode(error, source)
            ? 'component-load-unsupported'
            : 'component-load-failed',
          file: relative,
          message: failureMessage(error),
        })
      }
    }
  } finally {
    hookContexts.delete(token)
  }
  return { components, failures }
}
