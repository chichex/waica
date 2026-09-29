import { useCallback, useRef, type RefObject } from 'react'
import type { ViewportHandle } from './Viewport'

/** Reads the mounted viewport's imperative handle; null while no stage is mounted. */
export type ViewportAccess = () => ViewportHandle | null

/**
 * The stage's imperative handle: the ref the mounted Viewport fills, and a
 * stable accessor for event handlers that patch live entities (Inspector
 * prop edits) instead of rebuilding the stage.
 */
export function useViewportHandle(): [RefObject<ViewportHandle | null>, ViewportAccess] {
  const viewport = useRef<ViewportHandle>(null)
  const access = useCallback((): ViewportHandle | null => viewport.current, [])
  return [viewport, access]
}
