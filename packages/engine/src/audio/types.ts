import type { Entity } from '../entity.js'

export interface AudioPlayOptions {
  /** Mixer channel; defaults to 'sfx'. Naming any other channel creates it at volume 1. */
  channel?: string
  /** The sound's own gain, independent of the channel/master mix. Defaults to 1. */
  volume?: number
  loop?: boolean
  /**
   * 'session' survives Game.unloadScene() (CA-7); omitted means scene-scoped
   * — the default, and the common case (ADR 0012).
   */
  scope?: 'session'
  /**
   * Positional playback (CA-8). An `Entity` tracks its current position
   * every frame; a plain `{ x, y }` fixes the placement. Omitted, the sound
   * is flat: no panning, no distance attenuation. Attenuation is computed
   * from the distance to the listener (the camera) in logical coordinates;
   * panning is computed from both positions after `game.renderPoint()`, so
   * an isometric source that reads to the right on screen pans right even
   * though its volume reflects real (logical) game distance.
   */
  at?: Entity | { x: number; y: number }
}

export interface SoundHandle {
  stop(opts?: { fadeMs?: number }): void
  readonly playing: boolean
  volume: number
}

export interface AudioChannelState {
  volume: number
  muted: boolean
}

export interface LiveSoundInfo {
  uri: string
  channel: string
  scope: 'scene' | 'session'
}
