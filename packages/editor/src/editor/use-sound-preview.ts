import { useState } from 'react'
import { browserSoundPreview } from './sound-preview'
import type { ArtItem } from './use-project-art'

/** The library sound preview: which sound is playing, and how to start or stop it. */
export interface LibrarySoundPreview {
  /**
   * The project path of the library sound preview currently playing, or
   * null — review finding B, keyed on path rather than url per review
   * finding 1 (useProjectArt's object URLs don't survive a re-scan).
   */
  previewingPath: string | null
  play: (item: ArtItem) => void
  /** Stops the library sound preview, if one is running (review finding B). */
  stop: () => void
}

export function useSoundPreview(): LibrarySoundPreview {
  const [previewingPath, setPreviewingPath] = useState<string | null>(null)
  return {
    previewingPath,
    play: (item) => {
      setPreviewingPath(item.path)
      browserSoundPreview.play(item.url, () =>
        setPreviewingPath((current) => (current === item.path ? null : current)),
      )
    },
    stop: () => {
      browserSoundPreview.stop()
      setPreviewingPath(null)
    },
  }
}
