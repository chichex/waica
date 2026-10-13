import type { Game, PickedTarget, RaycastPick } from '@waica/engine'
import { useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from 'react'
import type { ScreenRect } from './viewport-entity-gesture'
import type { EditView3d } from './viewport-3d-view'
import { isThreeDView } from './viewport-camera'
import { zoomEditView } from './viewport-game'
import { beginGesture, dragGesture, endGesture, type Gesture, type GestureCallbacks, type PointerStep } from './viewport-gestures'
import type { EditCamera, EditorWorld, ViewportLive } from './viewport-live'
import { hoverCursor, toWorld } from './viewport-pointer-targets'

export interface ViewportPointerSession {
  canvasRef: RefObject<HTMLCanvasElement | null>
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  camRef: RefObject<EditCamera>
  camLiveRef: RefObject<{ x: number; y: number } | null>
  /** The 3D edit view of an edit-mode Game; a 3D scene picks through it. */
  view3dRef: RefObject<EditView3d | null>
  showCamera: boolean
}

/**
 * A click's pick in a 3D scene (issue #173 CA-13, CA-14): an entity selects
 * it (Shift toggles it in the multi-selection), the camera icon opens the
 * camera inspector, and empty space clears the selection (Shift keeps it).
 */
function select3d(pick: RaycastPick<PickedTarget> | null, shiftKey: boolean, callbacks: GestureCallbacks): void {
  const picked = pick?.entity ?? null
  if (picked === 'camera') callbacks.onSelectCamera?.()
  else if (picked && shiftKey) callbacks.onToggleSelect?.(picked.name)
  else if (picked) callbacks.onSelect(picked.name)
  else if (!shiftKey) callbacks.onSelect(null)
}

/** A press over an edited 3D scene: a plain left click picks, the rest navigates the Editor Camera. True when it was one. */
function press3d(view3d: EditView3d | null, e: PointerEvent<HTMLElement>, callbacks: GestureCallbacks): boolean {
  if (!view3d?.isActive()) return false
  // A press on a gizmo handle drags it (CA-18): it picks nothing.
  if (e.button === 0 && !e.altKey && !view3d.grabbing()) select3d(view3d.pick(e.clientX, e.clientY), e.shiftKey, callbacks)
  return true
}

/** Shows `cursor` on the live Game's canvas inside the viewport surface, where the cursor always was. */
function showHoverCursor(surface: HTMLElement, cursor: string): void {
  const target = surface.querySelector('canvas') ?? surface
  target.style.cursor = cursor
}

/**
 * The edit viewport's pointer interaction: one gesture at a time (paint,
 * box edit, camera drag, entity drag, marquee or pan) from pointer-down to
 * pointer-up, hover cursors in between, and wheel zoom.
 */
export function useViewportPointer(session: ViewportPointerSession, callbacks: GestureCallbacks) {
  const { canvasRef, gameRef, liveRef, camRef, camLiveRef, view3dRef, showCamera } = session
  const gestureRef = useRef<Gesture | null>(null)
  /** Marquee selection rectangle on screen, while one is dragged. */
  const [marqueeRect, setMarqueeRect] = useState<ScreenRect | null>(null)
  const host = { callbacks, showCamera, canvas: canvasRef, cameraDrag: camLiveRef, showMarquee: setMarqueeRect }

  /** The pointer over the live world, or null outside edit mode. */
  const editStep = (e: PointerEvent<HTMLElement>): PointerStep | null => {
    const game = gameRef.current
    const live = liveRef.current
    // The 2D gestures do not apply to a 3D scene: it picks through the Editor Camera instead.
    if (!game || live.mode !== 'edit' || isThreeDView(game)) return null
    const world: EditorWorld = { game, live }
    const point = toWorld(canvasRef.current, game, e)
    return { world, host, at: { point, shiftKey: e.shiftKey, clientX: e.clientX, clientY: e.clientY } }
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>): void => {
    // A press over an edited 3D scene picks or navigates; anywhere else it may start a 2D gesture.
    const step = press3d(view3dRef.current, e, callbacks) ? null : editStep(e)
    if (!step) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic events or already-released pointers: the drag works anyway
    }
    gestureRef.current = beginGesture(step)
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>): void => {
    const step = editStep(e)
    if (!step) return
    const gesture = gestureRef.current
    if (gesture) gestureRef.current = dragGesture(step, gesture)
    else showHoverCursor(e.currentTarget, hoverCursor(step.world.game, step.world.live, step.at.point))
  }

  const onPointerUp = (): void => {
    const gesture = gestureRef.current
    if (gesture) endGesture({ game: gameRef.current, live: liveRef.current }, host, gesture)
    gestureRef.current = null
    camLiveRef.current = null
  }

  const onWheel = (e: WheelEvent<HTMLElement>): void => {
    zoomEditView({ gameRef, liveRef, camRef }, e.deltaY > 0 ? 1.1 : 1 / 1.1)
  }

  return { marqueeRect, handlers: { onPointerDown, onPointerMove, onPointerUp, onWheel } }
}
