/**
 * Editor-owned sound preview (CA-18 of
 * .sdd/specs/issue-67-engine-audio-subsystem.md), deliberately independent
 * of game.audio: in edit mode game.simulate is false and the engine's own
 * AudioContext is suspended (ADR 0013), so routing a library preview through
 * it would need a suspend bypass that exists only for the editor. This is a
 * plain <audio> element instead — always at full volume, regardless of the
 * game's mixer or whether the game simulates.
 *
 * Kept as an injectable interface (not a bare function) so the library row
 * that triggers it stays seam-testable without a real Audio element, the
 * same way an injectable backend made the engine's own audio testable.
 *
 * At most one preview plays at a time (review finding B): starting a new one
 * stops whatever was playing, and the caller can stop the current one
 * directly. Without this, a long track like the isometric town theme
 * (97.5s) had no way to be silenced short of reloading the editor.
 */
export interface SoundPreview {
  /**
   * Plays `url`, stopping any preview already in progress first. `onEnded`
   * fires exactly once for this preview — when it finishes naturally, is
   * stopped by `stop()`, or is replaced by another `play()` call — so a
   * caller can reset any "currently playing" UI state.
   */
  play(url: string, onEnded?: () => void): void
  /** Stops the current preview, if any; a no-op otherwise. */
  stop(): void
}

class BrowserSoundPreview implements SoundPreview {
  private current: { audio: HTMLAudioElement; onEnded?: () => void } | null = null

  play(url: string, onEnded?: () => void): void {
    this.stop()
    const audio = new Audio(url)
    audio.volume = 1
    audio.addEventListener('ended', () => this.finish(audio))
    this.current = { audio, onEnded }
    void audio.play().catch(() => {
      // A decode or autoplay-policy failure here is not actionable from the
      // editor's asset library — never let it surface as a crash. Treat it
      // as an immediate end so the caller's UI state doesn't get stuck.
      this.finish(audio)
    })
  }

  stop(): void {
    if (this.current) this.finish(this.current.audio)
  }

  private finish(audio: HTMLAudioElement): void {
    if (this.current?.audio !== audio) return
    const { onEnded } = this.current
    this.current = null
    audio.pause()
    onEnded?.()
  }
}

export const browserSoundPreview: SoundPreview = new BrowserSoundPreview()
