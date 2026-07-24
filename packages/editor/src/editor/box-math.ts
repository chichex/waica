/**
 * Pure geometry for the editor's box tools: corner-anchored resizing in the
 * viewport and pixel↔world-unit conversions (image sizing, camera readout).
 */

export interface CornerResize {
  width: number
  height: number
  centerX: number
  centerY: number
}

/**
 * A corner drag with the opposite corner pinned: the box spans from the
 * anchor (the corner NOT being dragged, in world space) to the pointer.
 * Sizes never collapse below `min`; when clamped, the box stays on the
 * pointer's side of the anchor.
 */
export function cornerResize(
  anchorX: number,
  anchorY: number,
  pointerX: number,
  pointerY: number,
  min = 0.1,
): CornerResize {
  const spanX = pointerX - anchorX
  const spanY = pointerY - anchorY
  const width = Math.max(min, Math.abs(spanX))
  const height = Math.max(min, Math.abs(spanY))
  const dirX = spanX < 0 ? -1 : 1
  const dirY = spanY < 0 ? -1 : 1
  return {
    width,
    height,
    centerX: anchorX + (dirX * width) / 2,
    centerY: anchorY + (dirY * height) / 2,
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100

/**
 * An image's natural size in world units. For sprite sheets (cols/rows > 1)
 * the size of ONE frame — that's what the quad shows.
 */
export function imageSizeInUnits(
  pixelWidth: number,
  pixelHeight: number,
  pixelsPerUnit: number,
  cols = 1,
  rows = 1,
): { width: number; height: number } {
  const ppu = pixelsPerUnit > 0 ? pixelsPerUnit : 1
  return {
    width: round2(pixelWidth / Math.max(1, cols) / ppu),
    height: round2(pixelHeight / Math.max(1, rows) / ppu),
  }
}

/** The world-unit rectangle a camera shows: zoom is its height, width follows the aspect. */
export function cameraViewSize(zoom: number, aspect: number): { width: number; height: number } {
  return { width: round2(zoom * aspect), height: round2(zoom) }
}
