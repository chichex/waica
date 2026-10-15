import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { desktopIssues, isJsonObject } from './desktop-config.js'
import { requireWaicaProject, WaicaToolError } from './project-path.js'
import { schema } from './tool-schema.js'

const ID_LIST = { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true } as const

/** The sixteenth tool (issue #200 H-29): the only editor of game.json's `desktop` block. */
export const CONFIGURE_DESKTOP_TOOL: Tool = {
  name: 'configure_desktop',
  description:
    "Merge settings into src/game.json's desktop block (what waica export desktop reads); other keys are kept and the resulting block is returned.",
  inputSchema: schema({
    fullscreen: { type: 'boolean', description: 'Open the exported window fullscreen.' },
    scale: { type: 'number', exclusiveMinimum: 0, description: 'The window opens at resolution × scale (default 2).' },
    steam: {
      anyOf: [
        {
          type: 'object',
          properties: { appId: { type: 'integer', minimum: 1 }, achievements: ID_LIST, stats: ID_LIST },
          additionalProperties: false,
        },
        { type: 'null' },
      ],
      description: 'Steamworks: merged into desktop.steam (lists replace the old ones); null removes it.',
    },
  }),
  // Destructive: it overwrites values in an existing game.json, replaces whole lists and steam: null deletes.
  annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
}

/** The top-level settings a merge simply overwrites; `steam` merges field by field. */
const VALUE_FIELDS = ['fullscreen', 'scale'] as const
const FIELDS = new Set<string>([...VALUE_FIELDS, 'steam'])
const STEAM_FIELDS = new Set(['appId', 'achievements', 'stats'])

/** Every field is under `desktop.`: the merge always yields an object, so the block itself is never the bad one. */
function invalid(projectPath: string, field: string, message: string): WaicaToolError {
  return new WaicaToolError({ code: 'invalid-desktop-config', message: `desktop.${field} ${message}`, projectPath, field })
}

/** Unknown arguments are refused by name, as the schema's additionalProperties says. */
function checkArgumentNames(args: Record<string, unknown>, projectPath: string): void {
  const unknown = Object.keys(args).find((key) => key !== 'project_path' && !FIELDS.has(key))
  if (unknown) throw invalid(projectPath, unknown, 'is not a desktop setting')
  const { steam } = args
  if (steam !== undefined && steam !== null && !isJsonObject(steam)) {
    throw invalid(projectPath, 'steam', 'must be an object with appId, achievements and stats, or null')
  }
  const unknownSteam = isJsonObject(steam) ? Object.keys(steam).find((key) => !STEAM_FIELDS.has(key)) : undefined
  if (unknownSteam) throw invalid(projectPath, `steam.${unknownSteam}`, 'is not a Steam setting')
}

/** The block after the merge: given fields win, lists replace, `steam: null` drops steam. */
function mergedDesktop(current: unknown, args: Record<string, unknown>): Record<string, unknown> {
  const desktop: Record<string, unknown> = isJsonObject(current) ? { ...current } : {}
  for (const field of VALUE_FIELDS) {
    if (args[field] !== undefined) desktop[field] = args[field]
  }
  const { steam } = args
  if (steam === null) delete desktop['steam']
  else if (isJsonObject(steam)) desktop['steam'] = { ...(isJsonObject(desktop['steam']) ? desktop['steam'] : {}), ...steam }
  return desktop
}

async function readGame(projectPath: string): Promise<Record<string, unknown>> {
  const file = path.join(projectPath, 'src/game.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    // A Project marked only by its main scene has no game.json: missing, not invalid.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WaicaToolError({
        code: 'missing-game-json',
        message: 'src/game.json does not exist: configure_desktop edits the desktop block of an existing game.json.',
        projectPath,
      })
    }
    throw new WaicaToolError({ code: 'invalid-game-json', message: `Cannot read src/game.json: ${(error as Error).message}`, projectPath })
  }
  if (!isJsonObject(parsed)) {
    throw new WaicaToolError({ code: 'invalid-game-json', message: 'src/game.json must hold a JSON object.', projectPath })
  }
  return parsed
}

/**
 * configure_desktop (CA-20): merges the arguments into game.json's desktop
 * block and writes the file only when the result is valid — scale above 0,
 * a positive integer appId, no repeated id; it names the first bad field.
 */
export async function configureDesktop(projectPath: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const check = await requireWaicaProject(projectPath)
  checkArgumentNames(args, projectPath)
  const game = await readGame(projectPath)
  const desktop = mergedDesktop(game['desktop'], args)
  const [issue] = desktopIssues(desktop)
  if (issue) throw invalid(projectPath, issue.field, issue.message)
  await writeFile(path.join(projectPath, 'src/game.json'), `${JSON.stringify({ ...game, desktop }, null, 2)}\n`)
  return { desktop, file: 'src/game.json', notes: check.notes, provenance: [], warnings: [] }
}
