export interface ProjectedPoint {
  x: number
  y: number
}

const cleanZero = (value: number): number => (value === 0 ? 0 : value)

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
