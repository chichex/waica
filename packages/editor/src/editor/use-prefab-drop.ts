import type { Game } from '@waica/engine'
import { useState, type DragEvent, type RefObject } from 'react'
import { rounded } from './group-transform'
import { snapActive, snapPoint } from './grid'
import type { EditView3d } from './viewport-3d-view'
import { logicalAt } from './viewport-boxes'
import { isThreeDView } from './viewport-camera'
import type { ViewportLive } from './viewport-live'
import { toWorld } from './viewport-pointer-targets'

export interface PrefabDropTarget {
  canvasRef: RefObject<HTMLCanvasElement | null>
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  /** The 3D edit view of an edit-mode Game: a 3D scene places a drop through it. */
  view3dRef: RefObject<EditView3d | null>
  /** Accepts 'waica/prefab' drops (refs); omit to reject drops (prefab stage). */
  onDropPrefab?: (ref: string, world: [number, number] | [number, number, number]) => void
}

/**
 * Where a drop lands in an edited 3D scene (issue #173 CA-22): the point the
 * ray through the Editor Camera hits on a Model's surface, else on the y=0
 * plane (the lights' and camera's icons do not catch it); null when it meets
 * neither. Rounded to 0.001, as a gizmo commit rounds (inference 20).
 */
function dropPoint3d(view3d: EditView3d, e: DragEvent<HTMLElement>): [number, number, number] | null {
  const pick = view3d.pick(e.clientX, e.clientY, false)
  return pick && [rounded(pick.point.x), rounded(pick.point.y), rounded(pick.point.z)]
}

/** Dropping a prefab from the Explorer onto the edit viewport, at the (snapped) logical point, or the 3D point it lands on. */
export function usePrefabDrop({ canvasRef, gameRef, liveRef, view3dRef, onDropPrefab }: PrefabDropTarget) {
  const [dropHover, setDropHover] = useState(false)

  const onDragOver = (e: DragEvent<HTMLElement>): void => {
    if (!onDropPrefab || liveRef.current.mode !== 'edit') return
    // Over a 3D scene, only where a drop would land (not at the sky).
    const view3d = view3dRef.current
    if (view3d?.isActive() && !dropPoint3d(view3d, e)) {
      e.dataTransfer.dropEffect = 'none'
      setDropHover(false)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHover(true)
  }

  const onDrop = (e: DragEvent<HTMLElement>): void => {
    setDropHover(false)
    if (!onDropPrefab) return
    e.preventDefault()
    // 'waica/template' is the pre-explorer label format, still accepted.
    const ref = e.dataTransfer.getData('waica/prefab') || e.dataTransfer.getData('waica/template')
    if (!ref) return
    const view3d = view3dRef.current
    if (view3d?.isActive()) {
      const point = dropPoint3d(view3d, e)
      if (point) onDropPrefab(ref, point)
      return
    }
    // A 3D scene takes no drop at a 2D point.
    if (gameRef.current && isThreeDView(gameRef.current)) return
    const live = liveRef.current
    let world = toWorld(canvasRef.current, gameRef.current, e)
    if (snapActive(live.grid.snap, e.shiftKey)) world = snapPoint(live.grid, world[0], world[1])
    onDropPrefab(ref, logicalAt(live, world))
  }

  return { dropHover, handlers: { onDragOver, onDragLeave: () => setDropHover(false), onDrop } }
}
