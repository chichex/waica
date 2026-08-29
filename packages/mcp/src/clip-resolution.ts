import { resolveDirectionalClip, type DirectionalAnimation } from '@waica/engine'

/**
 * Whether `clip` is playable against the clips a sibling AnimatedSprite
 * declares.
 *
 * Literal by default: without an archetype contract there is nothing to
 * resolve, so the name must be a key of the sheet. When the archetype
 * declares a DirectionalAnimation, the genre names its art `<state>-<dir>`
 * and the engine resolves the plain state name at runtime, so a clip also
 * counts as playable when `resolveDirectionalClip` finds something for
 * *every* declared direction — mirrors and the contract's state fallbacks
 * included. That is the same rule `archetype-conformance.test.ts` applies to
 * the shipped manifests.
 *
 * A contract that declares no direction resolves nothing rather than
 * accepting every clip vacuously.
 */
export function isPlayableClip(
  clips: ReadonlySet<string>,
  clip: string,
  animation: DirectionalAnimation | undefined,
): boolean {
  if (clips.has(clip)) return true
  if (!animation || animation.directions.length === 0) return false
  return animation.directions.every(
    (direction) => resolveDirectionalClip(animation, clips, clip, direction).clip !== undefined,
  )
}
