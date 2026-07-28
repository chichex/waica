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
  if (!text) return settings
  try {
    const json = JSON.parse(text) as Partial<GameSettingsJson>
    if (typeof json.archetype === 'string' && json.archetype !== '') {
      settings.archetype = json.archetype
    }
    const res = json.resolution
    if (res?.mode === 'fill' || res?.mode === 'fixed') settings.resolution.mode = res.mode
    if (typeof res?.width === 'number' && res.width > 0) settings.resolution.width = res.width
    if (typeof res?.height === 'number' && res.height > 0) settings.resolution.height = res.height
    const ppu = json.pixelsPerUnit
    if (typeof ppu === 'number' && isFinite(ppu) && ppu > 0) settings.pixelsPerUnit = ppu
  } catch {
    // hand-edited into invalid JSON: the game still runs with the defaults
  }
  return settings
}

export function serializeGameSettings(settings: GameSettings): string {
  const json: GameSettingsJson = { waicaGame: 1, ...settings }
  return JSON.stringify(json, null, 2) + '\n'
}
