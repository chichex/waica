/**
 * Edit-mode UI preview layout: projects the scene-camera frame onto the
 * viewport canvas and sizes the play-mode reference box into it, so the
 * scene's UI pieces render as real HTML exactly where play will show them.
 */

/** The editor camera's visible world window (offsets around its center). */
export interface ViewWindow {
  left: number
  right: number
  top: number
  bottom: number
  /** Camera center in world units. */
  x: number
  y: number
}

/** A world-space rectangle by center and size (the camera-frame gizmo). */
export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface UiFrameLayout {
  /** Frame rectangle in canvas CSS pixels. */
  left: number
  top: number
  width: number
  height: number
  /** Scale that fits the reference box (play's canvas) into the frame. */
  scale: number
}

/**
 * Where the scene-camera frame lands on the canvas, plus the scale for the
 * UI reference box. The reference is what play renders the HTML against:
 * the fixed game resolution, or the viewport canvas itself. The frame and
 * the reference share their aspect by construction (the gizmo derives its
 * width from the same source), so one axis fixes the scale.
 */
export function uiFrameLayout(
  view: ViewWindow,
  frame: WorldRect,
  canvas: Size,
  reference: Size,
): UiFrameLayout {
  const pxPerUnitX = canvas.width / (view.right - view.left)
  const pxPerUnitY = canvas.height / (view.top - view.bottom)
  const width = frame.width * pxPerUnitX
  const height = frame.height * pxPerUnitY
  return {
    left: (frame.x - frame.width / 2 - (view.x + view.left)) * pxPerUnitX,
    top: (view.y + view.top - (frame.y + frame.height / 2)) * pxPerUnitY,
    width,
    height,
    scale: height / reference.height,
  }
}
