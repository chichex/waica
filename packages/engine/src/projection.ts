export interface ProjectedPoint {
  x: number
  y: number
}

const cleanZero = (value: number): number => (value === 0 ? 0 : value)

/**
 * Maps screen-relative input into the logical square-grid world used by
 * isometric simulation. The orthogonal rotation/reflection preserves input
 * magnitude and angles; vectors longer than one are clamped after mapping.
 */
export function screenInputToLogical(ix: number, iy: number): ProjectedPoint {
  let x = (ix - iy) / Math.SQRT2
  let y = (-ix - iy) / Math.SQRT2
  const length = Math.hypot(x, y)
  if (length > 1) {
    x /= length
    y /= length
  }
  return { x: cleanZero(x), y: cleanZero(y) }
}

/** Fixed 2:1 map from logical world coordinates to render coordinates. */
export function projectIsometric(lx: number, ly: number): ProjectedPoint {
  return {
    x: cleanZero(lx - ly),
    y: cleanZero(-(lx + ly) / 2),
  }
}

/** Exact inverse of projectIsometric. */
export function unprojectIsometric(x: number, y: number): ProjectedPoint {
  return {
    x: cleanZero(x / 2 - y),
    y: cleanZero(-x / 2 - y),
  }
}
