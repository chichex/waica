// game.json's `desktop` block (issue #200): what `waica export desktop`
// reads. configure_desktop and validate_project hold it to the same rules.

/** One rule a desktop block breaks: the field under `desktop.` and what it must be. */
export interface DesktopIssue {
  field: string
  message: string
}

type Json = Record<string, unknown>

export function isJsonObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function idListIssues(value: unknown, field: string): DesktopIssue[] {
  if (value === undefined) return []
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== '') : []
  if (!Array.isArray(value) || ids.length !== value.length) return [{ field, message: 'must be a list of non-empty ids' }]
  const seen = new Set<string>()
  const repeated = ids.find((id) => seen.size === seen.add(id).size)
  return repeated === undefined ? [] : [{ field, message: `lists "${repeated}" more than once` }]
}

function steamIssues(steam: unknown): DesktopIssue[] {
  if (steam === undefined) return []
  if (!isJsonObject(steam)) return [{ field: 'steam', message: 'must be an object with appId, achievements and stats' }]
  const { appId } = steam
  const appIdIssues =
    appId === undefined || (typeof appId === 'number' && Number.isSafeInteger(appId) && appId > 0)
      ? []
      : [{ field: 'steam.appId', message: 'must be a positive integer' }]
  return [...appIdIssues, ...idListIssues(steam['achievements'], 'steam.achievements'), ...idListIssues(steam['stats'], 'steam.stats')]
}

/** Every rule `desktop` breaks, in field order; none for a valid block. */
export function desktopIssues(desktop: unknown): DesktopIssue[] {
  if (!isJsonObject(desktop)) return [{ field: '', message: 'must be an object' }]
  const issues: DesktopIssue[] = []
  if (desktop['fullscreen'] !== undefined && typeof desktop['fullscreen'] !== 'boolean') {
    issues.push({ field: 'fullscreen', message: 'must be true or false' })
  }
  const { scale } = desktop
  if (scale !== undefined && !(typeof scale === 'number' && Number.isFinite(scale) && scale > 0)) {
    issues.push({ field: 'scale', message: 'must be a number above 0' })
  }
  return [...issues, ...steamIssues(desktop['steam'])]
}
