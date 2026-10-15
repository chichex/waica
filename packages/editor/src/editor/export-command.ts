/** The platforms `waica export desktop` takes, by the names its --platform flag uses, in its order. */
export const EXPORT_PLATFORMS = [
  { id: 'linux', label: 'Linux' },
  { id: 'win32', label: 'Windows' },
  { id: 'darwin', label: 'macOS' },
] as const

export type ExportPlatformId = (typeof EXPORT_PLATFORMS)[number]['id']

/** The signing and store-upload guide the modal links to (issue #200 CA-27). */
export const DESKTOP_GUIDE = 'https://github.com/chichex/waica/blob/main/docs/desktop-export.md'

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
