export interface ProjectedPoint {
  x: number
  y: number
}

/** Fixed 2:1 map from logical world coordinates to render coordinates. */
export function projectIsometric(lx: number, ly: number): ProjectedPoint {
  return { x: lx - ly, y: -(lx + ly) / 2 }
}

/** Exact inverse of projectIsometric. */
export function unprojectIsometric(x: number, y: number): ProjectedPoint {
  return { x: x / 2 - y, y: -x / 2 - y }
}
