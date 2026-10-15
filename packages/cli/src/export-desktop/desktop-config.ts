/** The Steam settings an export bakes in (game.json `desktop.steam`, or --steam-app-id). */
export interface SteamSettings {
  appId: number
  achievements: string[]
  stats: string[]
}

/** waica-desktop.json: what the shell's main process reads at launch (CA-8). */
export interface DesktopShellConfig {
  /** The app name: the window title. */
  name: string
  desktop: { fullscreen: boolean; scale: number }
  /** game.json's resolution; null when it declares none. */
  resolution: { width: number; height: number } | null
  steam: SteamSettings | null
}

/** game.json's `desktop.scale` when absent: 640×360 opens at 1280×720 (issue #200 inference 6). */
export const DEFAULT_SCALE = 2

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One line naming the field; an empty field names the `desktop` block itself. */
function fail(field: string, expected: string): never {
  throw new Error(`game.json ${field === '' ? 'desktop' : `desktop.${field}`} must be ${expected}`)
}

function optionalRecord(value: unknown, field: string): Json | null {
  if (value === undefined || value === null) return null
  return isRecord(value) ? value : fail(field, 'an object')
}

function idList(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id !== '')) {
    return fail(field, 'a list of non-empty ids')
  }
  return value.map(String)
}

function isAppId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function resolveSteam(desktop: Json | null, appIdFlag: number | null): SteamSettings | null {
  const block = optionalRecord(desktop?.['steam'], 'steam')
  if (!block && appIdFlag === null) return null
  const appId = appIdFlag ?? block?.['appId']
  if (!isAppId(appId)) {
    return fail('steam.appId', 'a positive integer (set it in game.json or pass --steam-app-id)')
  }
  return {
    appId,
    achievements: idList(block?.['achievements'], 'steam.achievements'),
    stats: idList(block?.['stats'], 'steam.stats'),
  }
}

function resolveDesktop(desktop: Json | null): DesktopShellConfig['desktop'] {
  const fullscreen = desktop?.['fullscreen'] ?? false
  if (typeof fullscreen !== 'boolean') return fail('fullscreen', 'true or false')
  const scale = desktop?.['scale'] ?? DEFAULT_SCALE
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return fail('scale', 'a number above 0')
  return { fullscreen, scale }
}

function resolveResolution(game: Json): DesktopShellConfig['resolution'] {
  const resolution = game['resolution']
  if (!isRecord(resolution)) return null
  const { width, height } = resolution
  const valid = (side: unknown): side is number => typeof side === 'number' && Number.isFinite(side) && side > 0
  return valid(width) && valid(height) ? { width, height } : null
}

/** Resolves waica-desktop.json from game.json and the flags; throws one line naming an invalid field. */
export function resolveShellConfig(
  game: unknown,
  name: string,
  steam: { enabled: boolean; appId: number | null },
): DesktopShellConfig {
  const root = isRecord(game) ? game : {}
  const desktop = optionalRecord(root['desktop'], '')
  return {
    name,
    desktop: resolveDesktop(desktop),
    resolution: resolveResolution(root),
    steam: steam.enabled ? resolveSteam(desktop, steam.appId) : null,
  }
}
