import type { ProjectFS } from '../fs/project-fs'
import { listRoleFiles, listStateFiles, ROLES_DIR, STATES_DIR } from './states'

/**
 * "Play runs your code": before the Play game is built, every project
 * state file (src/states/*.ts) and role file (src/roles/*.ts) is read,
 * transpiled in the browser and executed against the editor's own @waica
 * modules — their defineStates/defineRole register into the exact logic
 * sets the Play game reads, so custom states behave in editor Play as
 * they do in the shipped game. A file that fails (syntax error, an
 * import the editor can't serve) is reported and skipped: its states
 * fall back to animate-and-switch-by-data, never breaking Play.
 */

/** How Play code gets from TypeScript source to an executed module. */
export interface PlayCodeRunner {
  /** TypeScript source → plain ESM JavaScript. */
  transpile(source: string, path: string): Promise<string>
  /** Runs the transpiled module (imports rewritten to the editor's shims). */
  execute(js: string): Promise<void>
}

export interface PlayCodeResult {
  loaded: string[]
  errors: { path: string; message: string }[]
}

/** Static import/export-from lines (incl. a multi-line import's `} from`). */
const STATIC_IMPORT = /^(\s*(?:import|export|\})[^'"\n]*?)(["'])([^"'\n]+)\2/gm
/** Dynamic import('…') anywhere in an expression. */
const DYNAMIC_IMPORT = /(\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g

/**
 * Points known module specifiers at the editor's shim URLs. Unknown ones
 * are left alone — a real import of one makes the browser name it in its
 * load error. Line-anchored on purpose: an import-lookalike inside an
 * ordinary string never starts an import/export line, so it survives.
 */
export function rewriteImports(js: string, urls: Record<string, string>): string {
  const swap = (whole: string, lead: string, quote: string, spec: string): string => {
    const url = urls[spec]
    return url ? `${lead}${quote}${url}${quote}` : whole
  }
  return js.replace(STATIC_IMPORT, swap).replace(DYNAMIC_IMPORT, swap)
}

/** Runs every project state and role file; collects per-file failures. */
export async function loadPlayCode(fs: ProjectFS, runner: PlayCodeRunner): Promise<PlayCodeResult> {
  const paths = [
    ...(await listStateFiles(fs)).map((name) => `${STATES_DIR}/${name}`),
    ...(await listRoleFiles(fs)).map((name) => `${ROLES_DIR}/${name}`),
  ]
  const result: PlayCodeResult = { loaded: [], errors: [] }
  for (const path of paths) {
    try {
      const source = await fs.readText(path)
      if (source == null) continue
      await runner.execute(await runner.transpile(source, path))
      result.loaded.push(path)
    } catch (error) {
      result.errors.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
