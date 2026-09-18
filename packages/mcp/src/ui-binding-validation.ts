import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ValidationFinding } from './validation.js'

/**
 * Split out of validation.ts (close to the 950-line generation-policy cap):
 * the `{{binding}}` check over the project's UI pieces (src/ui/*.html).
 */

function statBindings(html: string): Set<string> {
  // GameUi binds text nodes only: attributes, comments, style and script
  // contents are not runtime bindings and must not create validator findings.
  const textOnly = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
  const names = new Set<string>()
  for (const match of textOnly.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)) {
    if (match[1]) names.add(match[1])
  }
  return names
}

/**
 * The stock Anchored Piece names the project's @waica/behaviors exports as
 * ANCHORED_UI_PIECES (ADR 0001). An older behaviors without that export,
 * or with a malformed one, names none.
 */
export function stockAnchoredPieces(behaviors: Readonly<Record<string, unknown>>): string[] {
  const names = behaviors['ANCHORED_UI_PIECES']
  if (!Array.isArray(names)) return []
  return names.filter((name): name is string => typeof name === 'string')
}

/**
 * An `undeclared-stat` warning for every `{{binding}}` of a UI piece that
 * names no declared stat. A piece in `anchoredPieces` — a stock Anchored
 * Piece (stockAnchoredPieces), or one some prefab or scene component names
 * through a `ref: 'ui'` param — is skipped: it is attached to an entity as
 * an Anchored Piece, whose bindings may resolve against the instance's own
 * values rather than Game stats.
 */
export async function uiBindingFindings(
  projectPath: string,
  uiFiles: readonly string[],
  declaredStats: ReadonlySet<string>,
  anchoredPieces: ReadonlySet<string>,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  for (const file of uiFiles) {
    if (anchoredPieces.has(file.slice(0, -'.html'.length))) continue
    const relative = `src/ui/${file}`
    const html = await readFile(path.join(projectPath, relative), 'utf8')
    for (const stat of statBindings(html)) {
      if (declaredStats.has(stat)) continue
      findings.push({
        severity: 'warning',
        code: 'undeclared-stat',
        message: `UI references undeclared stat "${stat}"; runtime writes may still create it.`,
        file: relative,
        ref: stat,
      })
    }
  }
  return findings
}
