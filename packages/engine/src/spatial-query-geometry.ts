import {
  collisionVertices,
  type CollisionBody,
  type CollisionPoint,
} from './collision-shape.js'

/** Internal absolute tolerance shared by point and ray boundary rules. */
export const SPATIAL_QUERY_EPSILON = 1e-9

function signedArea(points: readonly CollisionPoint[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    twiceArea += point[0] * next[1] - next[0] * point[1]
  }
  return twiceArea / 2
}

/** Valid finite geometry with a positive two-dimensional area. */
export function usableCollisionBody(value: unknown): value is CollisionBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Partial<CollisionBody>
  if (
    !Number.isFinite(body.x) ||
    !Number.isFinite(body.y) ||
    !Number.isFinite(body.width) ||
    !Number.isFinite(body.height)
  ) {
    return false
  }
  const vertices = collisionVertices(body as CollisionBody)
  return (
    vertices.length >= 3 &&
    vertices.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) &&
    Math.abs(signedArea(vertices)) > SPATIAL_QUERY_EPSILON
  )
}

function cross(a: CollisionPoint, b: CollisionPoint, point: CollisionPoint): number {
  return (b[0] - a[0]) * (point[1] - a[1]) -
    (b[1] - a[1]) * (point[0] - a[0])
}

function pointOnSegment(point: CollisionPoint, a: CollisionPoint, b: CollisionPoint): boolean {
  if (Math.abs(cross(a, b, point)) > SPATIAL_QUERY_EPSILON) return false
  return (
    point[0] >= Math.min(a[0], b[0]) - SPATIAL_QUERY_EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + SPATIAL_QUERY_EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - SPATIAL_QUERY_EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + SPATIAL_QUERY_EPSILON
  )
}

/** Strict containment in the existing collision outline. */
export function collisionBodyContainsPoint(
  body: unknown,
  x: number,
  y: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !usableCollisionBody(body)) return false
  const point: CollisionPoint = [x, y]
  const polygon = collisionVertices(body)
  let inside = false
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if (pointOnSegment(point, a, b)) return false
    const crosses =
      (a[1] > y) !== (b[1] > y) &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}
