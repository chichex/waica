import { worldToNormalized, type ViewCamera, type WorldPoint } from '../camera-projection.js'

/**
 * Engine constants for CA-8 positional audio. There are no public tuning
 * knobs (spec decision 20): the curve is picked once, in the spirit of
 * `CAMERA_DEFAULTS` (`camera.ts`), and frozen — CA-21 is the human-only
 * game-feel pass that may revisit these numbers by ear, never a per-call or
 * per-channel option.
 *
 * The attenuation curve mirrors WebAudio's own `PannerNode` "linear"
 * distance model: full volume at or inside `referenceDistance`, a straight
 * ramp down to silence at `maxDistance`, silent beyond it. `panDistance` is
 * the render-space horizontal offset (world units) that reaches full
 * left/right pan.
 */
export const AUDIO_SPATIAL_DEFAULTS = {
  referenceDistance: 3,
  maxDistance: 16,
  panDistance: 6,
} as const

/** 1 at/inside referenceDistance, 0 at/beyond maxDistance, linear in between. */
export function attenuationForDistance(distance: number): number {
  const { referenceDistance, maxDistance } = AUDIO_SPATIAL_DEFAULTS
  if (distance <= referenceDistance) return 1
  if (distance >= maxDistance) return 0
  return 1 - (distance - referenceDistance) / (maxDistance - referenceDistance)
}

/** Maps a render-space horizontal offset (source minus listener) to a [-1, 1] stereo pan. */
export function panForOffset(dx: number): number {
  const { panDistance } = AUDIO_SPATIAL_DEFAULTS
  return Math.max(-1, Math.min(1, dx / panDistance))
}

/**
 * The stereo pan of a world point in a 3D scene: where it lands across the
 * live camera's view, -1 at the left edge to 1 at the right; 0 for a point
 * the camera cannot see in front of it. The camera is read at every call.
 */
export function screenPanOf(camera: () => ViewCamera): (point: WorldPoint) => number {
  return (point) => {
    const at = worldToNormalized(camera(), point)
    return at ? Math.max(-1, Math.min(1, (at.nx - 0.5) * 2)) : 0
  }
}
