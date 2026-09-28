import type { Game } from '@waica/engine'
import { useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from 'react'
import type { ScreenRect } from './viewport-entity-gesture'
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
  showCamera: boolean
}

/**
 * The edit viewport's pointer interaction: one gesture at a time (paint,
 * box edit, camera drag, entity drag, marquee or pan) from pointer-down to
 * pointer-up, hover cursors in between, and wheel zoom.
 */
export function useViewportPointer(session: ViewportPointerSession, callbacks: GestureCallbacks) {
  const { canvasRef, gameRef, liveRef, camRef, camLiveRef, showCamera } = session
  const gestureRef = useRef<Gesture | null>(null)
  /** Marquee selection rectangle on screen, while one is dragged. */
  const [marqueeRect, setMarqueeRect] = useState<ScreenRect | null>(null)
  const host = { callbacks, showCamera, canvas: canvasRef, cameraDrag: camLiveRef, showMarquee: setMarqueeRect }

  /** The pointer over the live world, or null outside edit mode. */
  const editStep = (e: PointerEvent<HTMLCanvasElement>): PointerStep | null => {
    const game = gameRef.current
    const live = liveRef.current
    if (!game || live.mode !== 'edit') return null
    const world: EditorWorld = { game, live }
    const point = toWorld(canvasRef.current, game, e)
    return { world, host, at: { point, shiftKey: e.shiftKey, clientX: e.clientX, clientY: e.clientY } }
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>): void => {
    const step = editStep(e)
    if (!step) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic events or already-released pointers: the drag works anyway
    }
    gestureRef.current = beginGesture(step)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>): void => {
    const step = editStep(e)
    if (!step) return
    const gesture = gestureRef.current
    if (gesture) gestureRef.current = dragGesture(step, gesture)
    else e.currentTarget.style.cursor = hoverCursor(step.world.game, step.world.live, step.at.point)
  }

  const onPointerUp = (): void => {
    const gesture = gestureRef.current
    if (gesture) endGesture({ game: gameRef.current, live: liveRef.current }, host, gesture)
    gestureRef.current = null
    camLiveRef.current = null
  }

  const onWheel = (e: WheelEvent<HTMLCanvasElement>): void => {
    zoomEditView({ gameRef, liveRef, camRef }, e.deltaY > 0 ? 1.1 : 1 / 1.1)
  }

  return { marqueeRect, handlers: { onPointerDown, onPointerMove, onPointerUp, onWheel } }
}
