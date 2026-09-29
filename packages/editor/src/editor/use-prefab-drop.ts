import type { Game } from '@waica/engine'
import { useState, type DragEvent, type RefObject } from 'react'
import { snapActive, snapPoint } from './grid'
import { logicalAt } from './viewport-boxes'
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

  const onDragOver = (e: DragEvent<HTMLCanvasElement>): void => {
    if (!onDropPrefab || liveRef.current.mode !== 'edit') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHover(true)
  }

  const onDrop = (e: DragEvent<HTMLCanvasElement>): void => {
    setDropHover(false)
    if (!onDropPrefab) return
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
