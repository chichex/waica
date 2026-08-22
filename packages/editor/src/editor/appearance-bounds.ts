import { spritePlacement } from '@waica/engine'

export type EditorBoxRole = 'appearance' | 'collision'

export interface EditorBoxLike {
  width?: unknown
  height?: unknown
  offsetX?: unknown
  offsetY?: unknown
  anchorX?: unknown
  anchorY?: unknown
  flipX?: unknown
  frameScaleX?: unknown
  frameScaleY?: unknown
}

export interface EditorBoxBounds {
  centerX: number
  centerY: number
  width: number
  height: number
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Local-space box used by both the viewport gizmo and picking bounds. */
export function componentBox(
  box: EditorBoxLike,
  role: EditorBoxRole,
): EditorBoxBounds | null {
  if (typeof box.width !== 'number' || typeof box.height !== 'number') return null
  if (role === 'collision') {
    return {
      centerX: numberOr(box.offsetX, 0),
      centerY: numberOr(box.offsetY, 0),
      width: Math.abs(box.width),
      height: Math.abs(box.height),
    }
  }
  const placement = spritePlacement({
    width: box.width,
    height: box.height,
    offsetX: numberOr(box.offsetX, 0),
    offsetY: numberOr(box.offsetY, 0),
    anchorX: numberOr(box.anchorX, 0.5),
    anchorY: numberOr(box.anchorY, 0.5),
    flipX: box.flipX === true,
    frameScaleX: numberOr(box.frameScaleX, 1),
    frameScaleY: numberOr(box.frameScaleY, 1),
  })
  return {
    centerX: placement.x,
    centerY: placement.y,
    width: Math.abs(placement.scaleX),
    height: Math.abs(placement.scaleY),
  }
}

/** Union of every authoring box relative to the entity origin. */
export function entityBounds(
  components: ReadonlyArray<{ role: EditorBoxRole; box: EditorBoxLike }>,
): EditorBoxBounds {
  const boxes = components.flatMap(({ role, box }) => {
    const bounds = componentBox(box, role)
    return bounds ? [bounds] : []
  })
  if (boxes.length === 0) return { centerX: 0, centerY: 0, width: 0.6, height: 0.6 }
  const left = Math.min(...boxes.map((box) => box.centerX - box.width / 2))
  const right = Math.max(...boxes.map((box) => box.centerX + box.width / 2))
  const bottom = Math.min(...boxes.map((box) => box.centerY - box.height / 2))
  const top = Math.max(...boxes.map((box) => box.centerY + box.height / 2))
  return {
    centerX: (left + right) / 2,
    centerY: (bottom + top) / 2,
    width: right - left,
    height: top - bottom,
  }
}
