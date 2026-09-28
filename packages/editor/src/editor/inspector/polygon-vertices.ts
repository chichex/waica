import type { CollisionPoint } from '@waica/engine'

/** The vertex at `index`, wrapping past the end; a polygon always has vertices. */
function vertexAt(points: readonly CollisionPoint[], index: number): CollisionPoint {
  const point = points[index % points.length]
  if (!point) throw new Error(`polygon has no vertex at index ${index}`)
  return point
}

/** Splits the polygon's longest edge at its midpoint, appended as the last vertex. */
export function addPolygonVertex(points: CollisionPoint[]): CollisionPoint[] {
  let edge = 0
  let longest = -1
  for (const [index, [x1, y1]] of points.entries()) {
    const [x2, y2] = vertexAt(points, index + 1)
    const length = (x2 - x1) ** 2 + (y2 - y1) ** 2
    if (length > longest) {
      longest = length
      edge = index
    }
  }
  const [x1, y1] = vertexAt(points, edge)
  const [x2, y2] = vertexAt(points, edge + 1)
  // Rotate so the chosen edge closes the loop, then append its midpoint.
  // “− last” can therefore undo the topology change exactly.
  const start = (edge + 1) % points.length
  const rotated = [...points.slice(start), ...points.slice(0, start)]
  return [...rotated, [(x1 + x2) / 2, (y1 + y2) / 2]]
}
