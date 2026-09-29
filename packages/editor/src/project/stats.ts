import type { StatValue } from '@waica/engine'
import { isJsonObject, readJsonObject } from '../json-object'

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
  // Hand-edited into invalid JSON or junk: the game still runs, without declared stats.
  const declared = text ? readJsonObject(text)?.stats : undefined
  const stats: ProjectStats = {}
  if (!isJsonObject(declared)) return stats
  for (const [name, value] of Object.entries(declared)) {
    if (isStatValue(value)) stats[name] = value
  }
  return stats
}

export function serializeStats(stats: ProjectStats): string {
  const json: StatsJson = { waicaStats: 1, stats }
  return JSON.stringify(json, null, 2) + '\n'
}
