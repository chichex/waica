export type CollisionShape = 'rectangle' | 'circle' | 'polygon'
export type CollisionPoint = [number, number]

export interface CollisionBody {
  x: number
  y: number
  width: number
  height: number
  shape?: CollisionShape
  /** Polygon vertices normalized against width/height, centered on the entity. */
  points?: unknown
}

export interface CollisionBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export const COLLISION_SHAPES: readonly CollisionShape[] = [
  'rectangle',
  'circle',
  'polygon',
]

export const DEFAULT_COLLISION_POLYGON: ReadonlyArray<Readonly<CollisionPoint>> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
]

const CIRCLE_SEGMENTS = 32
const EPSILON = 1e-9

/** Valid serialized points, or a fresh default triangle. */
export function resolveCollisionPoints(value: unknown): CollisionPoint[] {
  if (Array.isArray(value) && value.length >= 3) {
    const points: CollisionPoint[] = []
    for (const point of value) {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        typeof point[0] !== 'number' ||
        typeof point[1] !== 'number' ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1])
      ) {
        return DEFAULT_COLLISION_POLYGON.map(([x, y]) => [x, y])
      }
      points.push([point[0], point[1]])
    }
    return points
  }
  return DEFAULT_COLLISION_POLYGON.map(([x, y]) => [x, y])
}

/** World-space outline used by collision tests and editor guides. */
export function collisionVertices(body: CollisionBody): CollisionPoint[] {
  const width = Math.abs(body.width)
  const height = Math.abs(body.height)
  const normalized =
    body.shape === 'circle'
      ? Array.from({ length: CIRCLE_SEGMENTS }, (_, index): CollisionPoint => {
          const angle = (index / CIRCLE_SEGMENTS) * Math.PI * 2
          return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5]
        })
      : body.shape === 'polygon'
        ? resolveCollisionPoints(body.points)
        : ([
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ] satisfies CollisionPoint[])
  return normalized.map(([x, y]) => [body.x + x * width, body.y + y * height])
}

export function collisionBounds(body: CollisionBody): CollisionBounds {
  const vertices = collisionVertices(body)
  let left = Infinity
  let right = -Infinity
  let top = -Infinity
  let bottom = Infinity
  for (const [x, y] of vertices) {
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.max(top, y)
    bottom = Math.min(bottom, y)
  }
  return { left, right, top, bottom }
}

/** Overlap between rectangle, ellipse/circle, and freeform simple polygons. */
export function collisionOverlap(a: CollisionBody, b: CollisionBody): boolean {
  const boundsA = collisionBounds(a)
  const boundsB = collisionBounds(b)
  if (
    boundsA.right <= boundsB.left ||
    boundsA.left >= boundsB.right ||
    boundsA.top <= boundsB.bottom ||
    boundsA.bottom >= boundsB.top
  ) {
    return false
  }

  const verticesA = collisionVertices(a)
  const verticesB = collisionVertices(b)
  if (polygonEdgesCross(verticesA, verticesB)) return true

  return hasInteriorPoint(verticesA, verticesB) || hasInteriorPoint(verticesB, verticesA)
}

/** Whether any closed-polygon edge of `polygonA` properly crosses one of `polygonB`. */
function polygonEdgesCross(polygonA: CollisionPoint[], polygonB: CollisionPoint[]): boolean {
  let a1 = polygonA.at(-1)
  if (a1 === undefined) return false
  for (const a2 of polygonA) {
    if (edgeCrossesPolygon(a1, a2, polygonB)) return true
    a1 = a2
  }
  return false
}

function edgeCrossesPolygon(a1: CollisionPoint, a2: CollisionPoint, polygon: CollisionPoint[]): boolean {
  let b1 = polygon.at(-1)
  if (b1 === undefined) return false
  for (const b2 of polygon) {
    if (segmentsCross(a1, a2, b1, b2)) return true
    b1 = b2
  }
  return false
}

function hasInteriorPoint(points: CollisionPoint[], polygon: CollisionPoint[]): boolean {
  if (hasVertexOrMidpointInside(points, polygon)) return true
  const center: CollisionPoint = [
    points.reduce((sum, [x]) => sum + x, 0) / points.length,
    points.reduce((sum, [, y]) => sum + y, 0) / points.length,
  ]
  return pointInPolygon(center, polygon)
}

/** Whether any vertex of `points`, or the midpoint of any of its closed-polygon edges, lies inside `polygon`. */
function hasVertexOrMidpointInside(points: CollisionPoint[], polygon: CollisionPoint[]): boolean {
  let previous = points.at(-1)
  if (previous === undefined) return false
  for (const point of points) {
    if (pointInPolygon(point, polygon)) return true
    if (pointInPolygon([(previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2], polygon)) {
      return true
    }
    previous = point
  }
  return false
}

function segmentsCross(
  a1: CollisionPoint,
  a2: CollisionPoint,
  b1: CollisionPoint,
  b2: CollisionPoint,
): boolean {
  const ab1 = cross(a1, a2, b1)
  const ab2 = cross(a1, a2, b2)
  const ba1 = cross(b1, b2, a1)
  const ba2 = cross(b1, b2, a2)
  return ab1 * ab2 < -EPSILON && ba1 * ba2 < -EPSILON
}

function cross(a: CollisionPoint, b: CollisionPoint, point: CollisionPoint): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])
}

function pointInPolygon(point: CollisionPoint, polygon: CollisionPoint[]): boolean {
  let inside = false
  let b = polygon.at(-1)
  if (b === undefined) return inside
  for (const a of polygon) {
    if (pointOnSegment(point, a, b)) return false
    const crosses =
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
    b = a
  }
  return inside
}

function pointOnSegment(point: CollisionPoint, a: CollisionPoint, b: CollisionPoint): boolean {
  if (Math.abs(cross(a, b, point)) > EPSILON) return false
  return (
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  )
}
