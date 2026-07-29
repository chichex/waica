import {
  collectModuleComponents,
  type ArchetypeBundle,
  type ComponentClass,
  type ComponentModule,
} from '@waica/engine'
import type { ProjectFS, TreeNode } from '../fs/project-fs'
import { installChassisArchetype } from './chassis'
import { COMPONENTS_DIR, listComponentFiles } from './components'
import { listRoleFiles, listStateFiles, ROLES_DIR, STATES_DIR } from './states'

/**
 * "Play runs your code": project component, state and role files are
 * transpiled in the browser and executed against the editor's own @waica
 * modules. Components run first so state/role modules can import them.
 */

/** How project code gets from TypeScript source to executable ESM. */
export interface PlayCodeRunner {
  /** TypeScript source → plain ESM JavaScript. */
  transpile(source: string, path: string): Promise<string>
  /** Creates one module URL after all of its project-relative dependencies. */
  createModule(js: string, path: string, imports: Record<string, string>): Promise<string>
  /** Imports a prepared URL and returns its module namespace. */
  execute(url: string, path: string): Promise<ComponentModule | void>
  /** Releases URLs from the previous editor/Play code run. */
  reset?(): void
}

export interface PlayCodeResult {
  loaded: string[]
  errors: { path: string; message: string }[]
  components: Record<string, ComponentClass>
  componentPaths: Record<string, string>
}

/** Static import/export-from lines (incl. a multi-line import's `} from`). */
const STATIC_IMPORT = /^(\s*(?:import|export|\})[^'"\n]*?)(["'])([^"'\n]+)\2/gm
/** Dynamic import('…') anywhere in an expression. */
const DYNAMIC_IMPORT = /(\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g

/** Points known module specifiers at URLs, leaving unknown bare imports alone. */
export function rewriteImports(js: string, urls: Record<string, string>): string {
  const swap = (whole: string, lead: string, quote: string, spec: string): string => {
    const url = urls[spec]
    return url ? `${lead}${quote}${url}${quote}` : whole
  }
  return js.replace(STATIC_IMPORT, swap).replace(DYNAMIC_IMPORT, swap)
}

/** One module specifier found in a file, and whether only import() reached it. */
interface ImportRef {
  specifier: string
  /** True when every occurrence came from import(), never a static import. */
  dynamicOnly: boolean
}

function importSpecifiers(js: string): ImportRef[] {
  const found = new Map<string, boolean>()
  for (const [pattern, dynamic] of [
    [STATIC_IMPORT, false],
    [DYNAMIC_IMPORT, true],
  ] as const) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(js); match; match = pattern.exec(js)) {
      const specifier = match[3]
      if (!specifier) continue
      if (!found.has(specifier) || !dynamic) found.set(specifier, dynamic)
    }
  }
  return [...found].map(([specifier, dynamicOnly]) => ({ specifier, dynamicOnly }))
}

function allTypeScriptFiles(nodes: TreeNode[]): string[] {
  const paths: string[] = []
  const visit = (entries: TreeNode[]): void => {
    for (const node of entries) {
      if (node.kind === 'dir') visit(node.children ?? [])
      else if (node.path.startsWith('src/') && node.path.endsWith('.ts')) paths.push(node.path)
    }
  }
  visit(nodes)
  return paths
}

function normalizeProjectPath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function resolveProjectImport(
  importer: string,
  specifier: string,
  available: ReadonlySet<string>,
): string | null {
  const base = importer.slice(0, importer.lastIndexOf('/') + 1)
  const direct = normalizeProjectPath(`${base}${specifier}`)
  const candidates = [direct, `${direct}.ts`, `${direct}/index.ts`]
  if (direct.endsWith('.js')) candidates.push(`${direct.slice(0, -3)}.ts`)
  return candidates.find((candidate) => available.has(candidate)) ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type CodeGroup = 'components' | 'states' | 'roles'

async function entryPaths(fs: ProjectFS, groups: readonly CodeGroup[]): Promise<string[]> {
  const paths: string[] = []
  if (groups.includes('components')) {
    paths.push(...(await listComponentFiles(fs)).map((name) => `${COMPONENTS_DIR}/${name}`))
  }
  if (groups.includes('states')) {
    paths.push(...(await listStateFiles(fs)).map((name) => `${STATES_DIR}/${name}`))
  }
  if (groups.includes('roles')) {
    paths.push(...(await listRoleFiles(fs)).map((name) => `${ROLES_DIR}/${name}`))
  }
  return paths
}

async function loadCode(
  fs: ProjectFS,
  runner: PlayCodeRunner,
  bundle: ArchetypeBundle,
  groups: readonly CodeGroup[],
): Promise<PlayCodeResult> {
  installChassisArchetype(bundle)
  runner.reset?.()

  const entries = await entryPaths(fs, groups)
  const available = new Set(allTypeScriptFiles(await fs.tree()))
  const transpiled = new Map<string, string>()
  const urls = new Map<string, string>()
  const failures = new Map<string, Error>()
  const building = new Set<string>()
  const result: PlayCodeResult = {
    loaded: [],
    errors: [],
    components: {},
    componentPaths: {},
  }

  const transpile = async (path: string): Promise<string> => {
    const previous = transpiled.get(path)
    if (previous != null) return previous
    const source = await fs.readText(path)
    if (source == null) throw new Error(`Project module disappeared: "${path}"`)
    const js = await runner.transpile(source, path)
    transpiled.set(path, js)
    return js
  }

  const build = async (path: string): Promise<string> => {
    const ready = urls.get(path)
    if (ready) return ready
    const failed = failures.get(path)
    if (failed) throw failed
    if (building.has(path)) throw new Error(`Circular project import involving "${path}"`)
    building.add(path)
    try {
      const js = await transpile(path)
      const imports: Record<string, string> = {}
      for (const { specifier, dynamicOnly } of importSpecifiers(js)) {
        if (!specifier.startsWith('.')) continue
        const target = resolveProjectImport(path, specifier, available)
        if (!target) {
          // A static import must resolve or the module cannot load at all.
          // An import() may sit in dead code — or in a comment the regex
          // cannot tell apart — so leave it for the browser to report if it
          // ever runs, the same policy bare specifiers get.
          if (dynamicOnly) continue
          throw new Error(`Cannot resolve project import "${specifier}" from "${path}"`)
        }
        imports[specifier] = await build(target)
      }
      const url = await runner.createModule(js, path, imports)
      urls.set(path, url)
      return url
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      failures.set(path, failure)
      throw failure
    } finally {
      building.delete(path)
    }
  }

  for (const path of entries) {
    try {
      const namespace = (await runner.execute(await build(path), path)) ?? {}
      result.loaded.push(path)
      if (path.startsWith(`${COMPONENTS_DIR}/`)) {
        // A class the editor cannot register is reported against its file:
        // "my component never shows up" is otherwise a silent no-op.
        const classes = collectModuleComponents([namespace], (message) =>
          result.errors.push({ path, message }),
        )
        for (const [name, Class] of Object.entries(classes)) {
          const owner = result.componentPaths[name]
          if (owner != null && owner !== path) {
            result.errors.push({
              path,
              message: `component "${name}" is already defined in "${owner}"`,
            })
            continue
          }
          result.components[name] = Class
          result.componentPaths[name] = path
        }
      }
    } catch (error) {
      result.errors.push({ path, message: errorMessage(error) })
    }
  }
  return result
}

/** Runs project components only, used to populate the editor outside Play. */
export function loadComponentCode(
  fs: ProjectFS,
  runner: PlayCodeRunner,
  bundle: ArchetypeBundle,
): Promise<PlayCodeResult> {
  return loadCode(fs, runner, bundle, ['components'])
}

/** Runs components, then every project state and role over a clean baseline. */
export function loadPlayCode(
  fs: ProjectFS,
  runner: PlayCodeRunner,
  bundle: ArchetypeBundle,
): Promise<PlayCodeResult> {
  return loadCode(fs, runner, bundle, ['components', 'states', 'roles'])
}
