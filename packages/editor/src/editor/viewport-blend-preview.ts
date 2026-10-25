// The Inspector's blend preview on the live Game (issue 205 CA-21): in edit
// mode, where no component steps, the stage plays one blend at one value on
// the selected entity's Animator and advances that Animator alone, one
// Animator.previewStep per frame. Nothing else moves, and nothing is written.
import { Animator, type Game } from '@waica/engine'

/** What the Inspector previews: a blend of one entity's Animator, its parameter held at a value. */
export interface BlendPreviewTarget {
  readonly entity: string
  readonly blend: string
  readonly param: string
  readonly value: number
}

/**
 * Why the stage cannot preview a blend now: the Game plays (`play`), the
 * entity has no Animator whose model loaded yet (`not-loaded`, worth asking
 * again), or its Animator was built without that blend or that parameter, as
 * after adding or renaming one in the Inspector (`not-built`: the stage has to
 * be rebuilt).
 */
export type BlendPreviewRefusal = 'play' | 'not-loaded' | 'not-built'

/** The longest step one preview frame takes: a tab back from the background resumes instead of jumping. */
const MAX_PREVIEW_STEP = 0.1

const liveAnimator = (game: Game | null, entity: string): Animator | undefined => game?.find(entity)?.get(Animator)

/** Why the edit-mode Game cannot play the target's blend on its entity's Animator now, or null when it can. */
export function previewRefusal(game: Game | null, mode: 'edit' | 'play', target: BlendPreviewTarget): BlendPreviewRefusal | null {
  if (mode !== 'edit') return 'play'
  const animator = liveAnimator(game, target.entity)
  const state = animator?.inspectState()
  if (!animator || !state?.loaded) return 'not-loaded'
  // The snapshot's params are the ones the built blends read, plus any written since.
  return animator.clipNames.includes(target.blend) && Object.hasOwn(state.params, target.param) ? null : 'not-built'
}

/** One frame of the preview: the blend at its value on the target's Animator, advanced by `dt`. */
export function stepBlendPreview(game: Game, target: BlendPreviewTarget | null, dt: number): void {
  const animator = target ? liveAnimator(game, target.entity) : undefined
  if (!target || !animator) return
  animator.setParam(target.param, target.value)
  animator.play(target.blend)
  animator.previewStep(dt)
}

/**
 * The preview's frames on one Game. In edit mode the host calls back once per
 * rendered frame with the fixed Simulation Step, whatever the display's rate,
 * so each frame steps the running preview by the real time since the previous
 * one (`now`, at most MAX_PREVIEW_STEP) instead: the blend plays at its own
 * speed at 30, 60 or 144 Hz. A preview's first frame takes the nominal step.
 */
export function previewFrames(game: Game, now: () => number = () => performance.now()): (target: BlendPreviewTarget | null, nominal: number) => void {
  let last: number | null = null
  return (target, nominal) => {
    if (!target) {
      last = null
      return
    }
    const time = now()
    const seconds = last === null ? nominal : Math.min(MAX_PREVIEW_STEP, Math.max(0, (time - last) / 1000))
    last = time
    stepBlendPreview(game, target, seconds)
  }
}

/** Ends a preview: the target's Animator back as a freshly built stage starts (Animator.previewReset). */
export function endBlendPreview(game: Game | null, target: BlendPreviewTarget | null): void {
  if (target) liveAnimator(game, target.entity)?.previewReset()
}
