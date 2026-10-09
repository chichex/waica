import type { Entity } from '../entity.js'
import { attenuationForDistance, panForOffset } from './spatial.js'

/** Where a positional sound's placement comes from (CA-8): a tracked entity, or a fixed point. */
export type SoundPlacement = { kind: 'entity'; entity: Entity } | { kind: 'point'; x: number; y: number; z: number }

/** What one update pass places sounds against: the listener and how to pan. */
interface PlacementView {
  listener: { x: number; y: number; z?: number }
  /** The listener in render space, converted once per pass and only when a 2D sound needs it. */
  listenerRender(): { x: number; y: number }
  toRenderSpace(x: number, y: number): { x: number; y: number }
  /** A 3D scene's pan from where a point lands on screen; absent in a 2D scene. */
  panOf3d?: (source: { x: number; y: number; z: number }) => number
}

export function placementView(
  listener: PlacementView['listener'],
  toRenderSpace: PlacementView['toRenderSpace'],
  panOf3d: PlacementView['panOf3d'],
): PlacementView {
  let converted: { x: number; y: number } | null = null
  return {
    listener,
    toRenderSpace,
    panOf3d,
    listenerRender: () => (converted ??= toRenderSpace(listener.x, listener.y)),
  }
}

/** The attenuation and pan one placed sound has this frame. */
export function placementMix(placement: SoundPlacement, view: PlacementView): { attenuation: number; pan: number } {
  const source = placement.kind === 'entity' ? placement.entity.position : placement
  const { listener } = view
  // Only a listener with a z (a 3D scene's camera) measures depth.
  const depth = listener.z === undefined ? 0 : source.z - listener.z
  const attenuation = attenuationForDistance(Math.hypot(source.x - listener.x, source.y - listener.y, depth))
  if (view.panOf3d) return { attenuation, pan: view.panOf3d(source) }
  return { attenuation, pan: panForOffset(view.toRenderSpace(source.x, source.y).x - view.listenerRender().x) }
}
