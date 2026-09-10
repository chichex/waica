/**
 * A decoded, backend-specific playback resource (e.g. a real AudioBuffer).
 * Opaque to the audio subsystem: it caches these by uri and hands them back
 * to `play()` unchanged.
 */
export type AudioResource = unknown

export interface BackendPlayOptions {
  /** Mixer channel this sound plays through (e.g. 'sfx', 'music'). */
  channel: string
  /** The sound's own gain, independent of the channel/master mix. */
  volume: number
  loop: boolean
  /**
   * Called exactly once, when the sound truly stops producing audio:
   * reaching its natural end, or after stop()/a fade-out ramp completes.
   * Never called for a sound still looping.
   */
  onEnded: () => void
}

export interface BackendPlayHandle {
  /** Changes the sound's own gain while it plays. */
  setVolume(volume: number): void
  /**
   * Sets the stereo pan in [-1, 1] (-1 fully left, 0 centered, 1 fully
   * right). Only ever called for a sound started with `at` (CA-8); a flat
   * sound never receives a call.
   */
  setPan(pan: number): void
  /**
   * Stops the sound. With no fadeMs, releases immediately (onEnded still
   * fires, but the caller doesn't wait for it). With fadeMs, ramps gain to
   * zero over that many milliseconds before releasing — onEnded fires once
   * the ramp completes, not before. Idempotent.
   */
  stop(fadeMs?: number): void
}

/**
 * The seam ADR 0013 exists for: everything Game needs from WebAudio,
 * abstracted so `happy-dom` — which has no AudioContext, AudioBuffer or
 * GainNode at all — can exercise the whole audio contract against an
 * injected fake. The real implementation (see web-audio-backend.ts) is the
 * default; a host replaces it via `GameOptions.audio`, e.g. to test its own
 * project's audio without a browser.
 */
export interface AudioBackend {
  /**
   * Fetches and decodes a uri into an opaque resource. The subsystem calls
   * this at most once per uri — the result is cached and reused.
   */
  load(uri: string): Promise<AudioResource>
  /** Starts playing a decoded resource. */
  play(resource: AudioResource, options: BackendPlayOptions): BackendPlayHandle
  /** Sets a channel's own gain (independent of mute). */
  setChannelVolume(channel: string, volume: number): void
  /** Silences (true) or restores (false) every sound on a channel without stopping them. */
  setChannelMuted(channel: string, muted: boolean): void
  /** Scales every channel's effective output. */
  setMasterVolume(volume: number): void
  /** Freezes all output; sounds in flight are neither stopped nor restarted. */
  suspend(): void
  /**
   * Resumes output. The real implementation lazily creates its underlying
   * AudioContext here (or at load()) — never eagerly, and never in a
   * constructor — so nothing touches the device before an unlock (CA-6).
   */
  resume(): void
  /** Stops everything permanently and releases the underlying context. */
  close(): void
}
