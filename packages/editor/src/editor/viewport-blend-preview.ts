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

/** The one step an ended preview takes to settle on the initial clip: past any fade into it. */
const SETTLE_SECONDS = 1

const liveAnimator = (game: Game | null, entity: string): Animator | undefined => game?.find(entity)?.get(Animator)

/** Whether the edit-mode Game has an Animator on the target's entity that can play its blend now. */
export function canPreview(game: Game | null, mode: 'edit' | 'play', target: BlendPreviewTarget): boolean {
  if (mode !== 'edit') return false
  return liveAnimator(game, target.entity)?.clipNames.includes(target.blend) ?? false
}

/** One frame of the preview: the blend at its value on the target's Animator, advanced by `dt`. */
export function stepBlendPreview(game: Game, target: BlendPreviewTarget | null, dt: number): void {
  const animator = target ? liveAnimator(game, target.entity) : undefined
  if (!target || !animator) return
  animator.setParam(target.param, target.value)
  animator.play(target.blend)
  animator.previewStep(dt)
}

/** Ends a preview: the target's Animator plays its initial clip again, settled there in one step. */
export function endBlendPreview(game: Game | null, target: BlendPreviewTarget | null): void {
  const animator = target ? liveAnimator(game, target.entity) : undefined
  if (!animator?.initialClip) return
  animator.play(animator.initialClip)
  animator.previewStep(SETTLE_SECONDS)
}
