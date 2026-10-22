import { createContext } from 'react'

/**
 * How the Inspector previews a blend on the live Game in edit mode (issue 205
 * CA-21): the slider of a blend's card asks the stage to play that blend at a
 * value on the selected entity's Animator, which then advances one step per
 * frame while nothing else does. Nothing reaches the scene file or the history.
 */
export interface BlendPreview {
  /** Changes whenever a running preview must end: another entity, Play, a rebuilt stage. */
  readonly session: string
  /** Why the slider cannot preview now, or null when it can. */
  readonly unavailable: string | null
  /** Plays `blend` with `param` at `value` on the live Animator; false when there is none able to. */
  start(blend: string, param: string, value: number): boolean
  /** Ends the preview: the Animator goes back to its initial clip. */
  stop(): void
}

/** The Editor's blend preview; null outside an Editor, where there is no live Game to preview on. */
export const BlendPreviewContext = createContext<BlendPreview | null>(null)
