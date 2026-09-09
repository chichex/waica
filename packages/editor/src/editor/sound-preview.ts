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
 */
export interface SoundPreview {
  play(url: string): void
}

class BrowserSoundPreview implements SoundPreview {
  play(url: string): void {
    const audio = new Audio(url)
    audio.volume = 1
    void audio.play().catch(() => {
      // A decode or autoplay-policy failure here is not actionable from the
      // editor's asset library — never let it surface as a crash.
    })
  }
}

export const browserSoundPreview: SoundPreview = new BrowserSoundPreview()
