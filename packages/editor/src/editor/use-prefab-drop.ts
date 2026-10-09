import type { Game } from '@waica/engine'
import { useState, type DragEvent, type RefObject } from 'react'
import { snapActive, snapPoint } from './grid'
import { logicalAt } from './viewport-boxes'
import { isReadOnlyView } from './viewport-camera'
import type { ViewportLive } from './viewport-live'
import { toWorld } from './viewport-pointer-targets'

export interface PrefabDropTarget {
  canvasRef: RefObject<HTMLCanvasElement | null>
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  /** Accepts 'waica/prefab' drops (refs); omit to reject drops (prefab stage). */
  onDropPrefab?: (ref: string, world: [number, number]) => void
}

/** Dropping a prefab from the Explorer onto the edit viewport, at the (snapped) logical point. */
export function usePrefabDrop({ canvasRef, gameRef, liveRef, onDropPrefab }: PrefabDropTarget) {
  const [dropHover, setDropHover] = useState(false)
  /** A 3D scene is read-only: nothing is dropped into it. */
  const readOnly = (): boolean => gameRef.current != null && isReadOnlyView(gameRef.current)

  const onDragOver = (e: DragEvent<HTMLElement>): void => {
    if (!onDropPrefab || liveRef.current.mode !== 'edit' || readOnly()) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHover(true)
  }

  const onDrop = (e: DragEvent<HTMLElement>): void => {
    setDropHover(false)
    if (!onDropPrefab || readOnly()) return
    e.preventDefault()
    // 'waica/template' is the pre-explorer label format, still accepted.
    const ref = e.dataTransfer.getData('waica/prefab') || e.dataTransfer.getData('waica/template')
    if (!ref) return
    const live = liveRef.current
    let world = toWorld(canvasRef.current, gameRef.current, e)
    if (snapActive(live.grid.snap, e.shiftKey)) world = snapPoint(live.grid, world[0], world[1])
    onDropPrefab(ref, logicalAt(live, world))
  }

  return { dropHover, handlers: { onDragOver, onDragLeave: () => setDropHover(false), onDrop } }
}
