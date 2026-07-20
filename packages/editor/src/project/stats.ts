import type { StatValue } from '@waica/engine'

/**
 * Project stats: named values the game tracks while playing (points, lives,
 * door-open flags…) with their initial values. Persisted as src/stats.json so
 * the shipped game and play-in-editor start from the same numbers; missing or
 * broken files degrade to no declared stats.
 */

export const STATS_PATH = 'src/stats.json'

export type ProjectStats = Record<string, StatValue>

export interface StatsJson {
  waicaStats: 1
  stats: ProjectStats
}

function isStatValue(value: unknown): value is StatValue {
  return (
    typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
  )
}

/**
 * Declared stats from a stats.json file's text. Tolerant: missing file,
 * bad JSON or junk entries all degrade to an empty declaration.
 */
export function parseStats(text: string | null): ProjectStats {
  if (!text) return {}
  try {
    const json = JSON.parse(text) as Partial<StatsJson>
    const stats: ProjectStats = {}
    for (const [name, value] of Object.entries(json.stats ?? {})) {
      if (isStatValue(value)) stats[name] = value
    }
    return stats
  } catch {
    // hand-edited into invalid JSON: the game still runs, without declared stats
    return {}
  }
}

export function serializeStats(stats: ProjectStats): string {
  const json: StatsJson = { waicaStats: 1, stats }
  return JSON.stringify(json, null, 2) + '\n'
}
