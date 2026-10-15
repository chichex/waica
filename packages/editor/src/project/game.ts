import { isJsonObject, readJsonObject } from '../json-object'

/**
 * Project game settings: global options of the shipped game that no scene
 * owns — the render resolution and the art scale. Persisted as
 * src/game.json so the shipped game and play-in-editor read the same file;
 * missing or broken files degrade to the defaults.
 */

export const GAME_PATH = 'src/game.json'

export interface ResolutionSetting {
  /** 'fill' stretches to the canvas; 'fixed' letterboxes to width×height. */
  mode: 'fill' | 'fixed'
  width: number
  height: number
}

export interface GameSettings {
  /** Archetype manifest id; legacy files without it resolve to platformer. */
  archetype: string
  resolution: ResolutionSetting
  /**
   * Art scale: how many image pixels one world unit covers. Editor-only
   * bridge between pixel-sized assets and world-unit sizes ("use image
   * size", the camera's pixel readout) — the engine never sees it.
   */
  pixelsPerUnit: number
  /**
   * The desktop export's block (issue #200) as it was read: the editor does
   * not edit it (the MCP's configure_desktop does). A save keeps the block
   * on disk (see serializeGameSettings); this copy only stands in when the
   * file on disk cannot be read.
   */
  desktop?: Record<string, unknown>
}

export interface GameSettingsJson extends GameSettings {
  waicaGame: 1
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  archetype: 'platformer',
  resolution: { mode: 'fill', width: 640, height: 360 },
  pixelsPerUnit: 16,
}

/**
 * Settings from a game.json file's text, merged over the defaults.
 * Tolerant: missing file, bad JSON or junk entries all degrade to defaults.
 */
export function parseGameSettings(text: string | null): GameSettings {
  const settings = structuredClone(DEFAULT_GAME_SETTINGS)
  // Hand-edited into invalid JSON or junk: the game still runs with the defaults.
  const json = text ? readJsonObject(text) : null
  if (!json) return settings
  if (typeof json.archetype === 'string' && json.archetype !== '') {
    settings.archetype = json.archetype
  }
  const res = isJsonObject(json.resolution) ? json.resolution : {}
  if (res.mode === 'fill' || res.mode === 'fixed') settings.resolution.mode = res.mode
  if (typeof res.width === 'number' && res.width > 0) settings.resolution.width = res.width
  if (typeof res.height === 'number' && res.height > 0) settings.resolution.height = res.height
  const ppu = json.pixelsPerUnit
  if (typeof ppu === 'number' && isFinite(ppu) && ppu > 0) settings.pixelsPerUnit = ppu
  if (isJsonObject(json.desktop)) settings.desktop = json.desktop
  return settings
}

/**
 * game.json with `settings` saved into it. The editor is not the file's only
 * writer (configure_desktop edits its desktop block while the editor is
 * open), so `onDisk`, the file as it is now, keeps every key the editor does
 * not edit, desktop included, in its place; the editor's own keys are
 * replaced. Without a readable file, the settings alone, with the desktop
 * block they were read with.
 */
export function serializeGameSettings(settings: GameSettings, onDisk: string | null = null): string {
  const { desktop, ...edited } = settings
  const current = onDisk ? readJsonObject(onDisk) : null
  const kept: Record<string, unknown> = current ?? (desktop ? { desktop } : {})
  return JSON.stringify({ ...kept, waicaGame: 1, ...edited }, null, 2) + '\n'
}
