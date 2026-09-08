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
   * Positional playback (CA-8, not implemented yet): accepted so call sites
   * can pass it, and currently ignored — the sound plays flat.
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
