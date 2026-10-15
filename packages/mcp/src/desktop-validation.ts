import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { desktopIssues, isJsonObject } from './desktop-config.js'
import type { ValidationFinding } from './validation-context.js'

const GAME_FILE = 'src/game.json'

/** `game.achievements.unlock('x')`, `setStat("x", …)`, `getStat('x')`: a quoted literal id (issue #200 inference 15). */
const ACHIEVEMENT_CALL = /\bachievements\s*\.\s*(unlock|setStat|getStat)\s*\(\s*(['"])([^'"\\\n]*)\2/g

/** CA-21: an invalid desktop block is an error on each field it breaks; no block is fine. */
function configFindings(desktop: unknown): ValidationFinding[] {
  if (desktop === undefined) return []
  return desktopIssues(desktop).map(({ field, message }) => {
    const name = field === '' ? 'desktop' : `desktop.${field}`
    return { severity: 'error', code: 'invalid-desktop-config', message: `game.json ${name} ${message}.`, file: GAME_FILE, ref: `game.json:${name}` }
  })
}

function declaredIds(desktop: unknown): { achievements: Set<string>; stats: Set<string> } {
  const steam = isJsonObject(desktop) && isJsonObject(desktop['steam']) ? desktop['steam'] : {}
  const ids = (value: unknown) => new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  return { achievements: ids(steam['achievements']), stats: ids(steam['stats']) }
}

/** Every .ts file under src/, as project paths, in a stable order. */
async function sourceFiles(projectPath: string): Promise<string[]> {
  const src = path.join(projectPath, 'src')
  const entries = await readdir(src, { recursive: true, withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.relative(projectPath, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
}

/** CA-22: a literal id the code passes to game.achievements that desktop.steam does not declare; a computed id is not checked. */
async function achievementIdFindings(projectPath: string, desktop: unknown): Promise<ValidationFinding[]> {
  const declared = declaredIds(desktop)
  const findings: ValidationFinding[] = []
  for (const file of await sourceFiles(projectPath)) {
    const source = await readFile(path.join(projectPath, file), 'utf8')
    for (const [, method, , id] of source.matchAll(ACHIEVEMENT_CALL)) {
      const list = method === 'unlock' ? 'achievements' : 'stats'
      if (id === undefined || declared[list].has(id)) continue
      const message = `achievements.${method ?? ''}('${id}') names an id not declared in game.json desktop.steam.${list}; the desktop shell will not send it to Steam.`
      findings.push({ severity: 'warning', code: 'unknown-achievement-id', message, file, ref: id })
    }
  }
  return findings
}

/** validate_project's desktop checks (issue #200): the desktop block itself, then the achievement ids the code uses. */
export async function desktopFindings(projectPath: string, game: unknown): Promise<ValidationFinding[]> {
  const desktop = isJsonObject(game) ? game['desktop'] : undefined
  return [...configFindings(desktop), ...(await achievementIdFindings(projectPath, desktop))]
}
