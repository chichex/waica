/** The platforms `waica export desktop` takes, by the names its --platform flag uses, in its order. */
export const EXPORT_PLATFORMS = [
  { id: 'linux', label: 'Linux' },
  { id: 'win32', label: 'Windows' },
  { id: 'darwin', label: 'macOS' },
] as const

export type ExportPlatformId = (typeof EXPORT_PLATFORMS)[number]['id']

/** The signing and store-upload guide the modal links to (issue #200 CA-27). */
export const DESKTOP_GUIDE = 'https://github.com/chichex/waica/blob/main/docs/desktop-export.md'

/**
 * game.json's Steam, as the modal needs it: null without a `desktop.steam`
 * object; its `appId` when that is a number, else null (`waica export
 * desktop` then needs `--steam-app-id`, or `--no-steam`).
 */
export type SteamDeclaration = { appId: number | null } | null

export function steamDeclaration(desktop: unknown): SteamDeclaration {
  if (typeof desktop !== 'object' || desktop === null || !('steam' in desktop)) return null
  const { steam } = desktop
  if (typeof steam !== 'object' || steam === null || Array.isArray(steam)) return null
  return { appId: 'appId' in steam && typeof steam.appId === 'number' ? steam.appId : null }
}

export interface ExportChoice {
  platforms: ReadonlySet<ExportPlatformId>
  /** null when game.json declares no Steam; false when the user turned it off. */
  steam: boolean | null
}

/**
 * The command to run in the project folder (issue #200 CA-24): the plain one
 * for every platform with Steam as declared, `--platform` naming the ones
 * left, `--no-steam` when the user turns a declared Steam off; null with no
 * platform at all.
 */
export function exportCommand({ platforms, steam }: ExportChoice): string | null {
  const chosen = EXPORT_PLATFORMS.filter(({ id }) => platforms.has(id)).map(({ id }) => id)
  if (chosen.length === 0) return null
  const parts = ['npx @waica/cli export desktop .']
  if (chosen.length < EXPORT_PLATFORMS.length) parts.push(`--platform ${chosen.join(',')}`)
  if (steam === false) parts.push('--no-steam')
  return parts.join(' ')
}
