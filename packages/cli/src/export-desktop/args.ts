/** The desktop platforms an export targets, by Node's (and @electron/packager's) names. */
export const EXPORT_PLATFORMS = ['linux', 'win32', 'darwin'] as const

export type ExportPlatform = (typeof EXPORT_PLATFORMS)[number]

/** `waica export desktop [dir] [flags]`, parsed; null means "take it from the project". */
export interface ExportArgs {
  dir: string
  platforms: ExportPlatform[]
  out: string | null
  name: string | null
  icon: string | null
  steamAppId: number | null
  /** False with --no-steam: the export leaves Steam out even when game.json declares it. */
  steam: boolean
  /** False with --no-install: a Project without node_modules stops the export instead of being installed. */
  install: boolean
  help: boolean
}

function isExportPlatform(value: string): value is ExportPlatform {
  return (EXPORT_PLATFORMS as readonly string[]).includes(value)
}

function parsePlatforms(value: string | undefined): ExportPlatform[] {
  if (value === undefined || value === '') throw new Error('--platform expects linux, win32 or darwin, comma-separated')
  const platforms: ExportPlatform[] = []
  for (const name of value.split(',')) {
    if (!isExportPlatform(name)) throw new Error(`invalid platform "${name}" (expected linux, win32 or darwin)`)
    if (!platforms.includes(name)) platforms.push(name)
  }
  return platforms
}

function parseAppId(value: string | undefined): number {
  const id = /^\d+$/.test(value ?? '') ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`--steam-app-id expects a positive integer, got "${value ?? ''}"`)
  }
  return id
}

/** The flags that take a string value, with what each expects when the value is missing. */
const STRING_FLAGS = {
  '--out': ['out', 'a directory'],
  '--name': ['name', 'a name'],
  '--icon': ['icon', 'a .png file'],
} as const

function isStringFlag(flag: string): flag is keyof typeof STRING_FLAGS {
  return Object.hasOwn(STRING_FLAGS, flag)
}

function readValueFlag(args: ExportArgs, flag: string, rest: string[]): boolean {
  if (flag === '--platform') args.platforms = parsePlatforms(rest.shift())
  else if (flag === '--steam-app-id') args.steamAppId = parseAppId(rest.shift())
  else if (isStringFlag(flag)) {
    const [field, expects] = STRING_FLAGS[flag]
    const value = rest.shift()
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} expects ${expects}`)
    args[field] = value
  } else return false
  return true
}

function readPositional(args: ExportArgs, value: string, seen: boolean): void {
  if (value.startsWith('-')) throw new Error(`unknown option "${value}" — try waica --help`)
  if (seen) throw new Error(`unexpected argument "${value}" — the export takes one project directory`)
  args.dir = value
}

/** Parses the arguments after `waica export desktop`; throws one line naming the bad value. */
export function parseExportArgs(argv: string[]): ExportArgs {
  const args: ExportArgs = {
    dir: '.',
    platforms: [...EXPORT_PLATFORMS],
    out: null,
    name: null,
    icon: null,
    steamAppId: null,
    steam: true,
    install: true,
    help: false,
  }
  const rest = [...argv]
  let seenDir = false
  for (let token = rest.shift(); token !== undefined; token = rest.shift()) {
    if (token === '--no-steam') args.steam = false
    else if (token === '--no-install') args.install = false
    else if (token === '--help') args.help = true
    else if (!readValueFlag(args, token, rest)) {
      readPositional(args, token, seenDir)
      seenDir = true
    }
  }
  return args
}
