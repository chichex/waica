// Steamworks in the shell's main process (ADR 0032): the only place that
// loads steamworks.js. The renderer reaches it through the preload's
// achievements, and only ids the Project declares are forwarded (H-15).
import type { SteamSettings } from '../desktop-config.js'

/** The slice of a steamworks.js client the shell uses. */
interface SteamClient {
  achievement: { activate(id: string): boolean }
  stats: { getInt(id: string): number | null; setInt(id: string, value: number): boolean; store(): boolean }
}

interface SteamworksModule {
  init(appId: number): unknown
  electronEnableSteamOverlay(): void
}

/** What the IPC handlers call: ids and values arrive from the page, so they are checked here. */
export interface SteamBridge {
  readonly available: boolean
  unlock(id: unknown): void
  setStat(id: unknown, value: unknown): void
  getStat(id: unknown): number | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasMethods(value: unknown, names: string[]): boolean {
  return isRecord(value) && names.every((name) => typeof value[name] === 'function')
}

function isSteamworksModule(value: unknown): value is SteamworksModule {
  return hasMethods(value, ['init', 'electronEnableSteamOverlay'])
}

function isSteamClient(value: unknown): value is SteamClient {
  return (
    isRecord(value) &&
    hasMethods(value['achievement'], ['activate']) &&
    hasMethods(value['stats'], ['getInt', 'setInt', 'store'])
  )
}

const UNAVAILABLE: SteamBridge = { available: false, unlock: () => {}, setStat: () => {}, getStat: () => undefined }

/** init(appId), then the overlay (H-13); null when steamworks.js is missing, broken or no Steam client runs. */
function connect(settings: SteamSettings, load: () => unknown): SteamClient {
  const steamworks = load()
  if (!isSteamworksModule(steamworks)) throw new Error('steamworks.js did not load')
  const client = steamworks.init(settings.appId)
  if (!isSteamClient(client)) throw new Error('steamworks.js returned no client')
  steamworks.electronEnableSteamOverlay()
  return client
}

function connectedBridge(settings: SteamSettings, client: SteamClient, warn: (line: string) => void): SteamBridge {
  const declared = (id: unknown, ids: string[], list: string): id is string => {
    if (typeof id === 'string' && ids.includes(id)) return true
    warn(`[waica] Steam: "${String(id)}" is not declared in game.json desktop.steam.${list}; not sent to Steam`)
    return false
  }
  return {
    available: true,
    unlock: (id) => {
      if (declared(id, settings.achievements, 'achievements')) client.achievement.activate(id)
    },
    setStat: (id, value) => {
      if (!declared(id, settings.stats, 'stats')) return
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        warn(`[waica] Steam: stat "${id}" needs a finite number; not sent to Steam`)
        return
      }
      client.stats.setInt(id, Math.trunc(value))
      client.stats.store()
    },
    getStat: (id) => (declared(id, settings.stats, 'stats') ? (client.stats.getInt(id) ?? undefined) : undefined),
  }
}

/**
 * Connects to Steam when the export includes it (CA-17). Without a Steam
 * client (or with a broken steamworks.js) it warns once and the game runs
 * with `achievements.available === false`.
 */
export function startSteam(settings: SteamSettings | null, load: () => unknown, warn: (line: string) => void): SteamBridge {
  if (!settings) return UNAVAILABLE
  try {
    return connectedBridge(settings, connect(settings, load), warn)
  } catch (error) {
    warn(`[waica] Steam is not available (${error instanceof Error ? error.message : String(error)}): achievements are off`)
    return UNAVAILABLE
  }
}
