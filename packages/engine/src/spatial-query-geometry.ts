import {
  collisionVertices,
  type CollisionBody,
  type CollisionPoint,
} from './collision-shape.js'

/** Internal absolute tolerance shared by point and ray boundary rules. */
export const SPATIAL_QUERY_EPSILON = 1e-9

export interface SpatialGeometryRayHit {
  readonly distance: number
  readonly point: Readonly<{ x: number; y: number }>
  readonly normal: Readonly<{ x: number; y: number }>
}

type PointLocation = 'outside' | 'boundary' | 'inside'

interface EdgeEvent {
  readonly distance: number
  readonly edgeOrder: number
  readonly normal?: CollisionPoint
}

interface EventGroup {
  readonly distance: number
  readonly normals: ReadonlyArray<Readonly<{ edgeOrder: number; normal: CollisionPoint }>>
}

function signedArea(points: readonly CollisionPoint[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    twiceArea += point[0] * next[1] - next[0] * point[1]
  }
  return twiceArea / 2
}

function finiteCollisionBody(value: unknown): value is CollisionBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Partial<CollisionBody>
  return (
    Number.isFinite(body.x) &&
    Number.isFinite(body.y) &&
    Number.isFinite(body.width) &&
    Number.isFinite(body.height)
  )
}

/** Valid finite geometry with a positive two-dimensional area. */
export function usableCollisionBody(value: unknown): value is CollisionBody {
  if (!finiteCollisionBody(value)) return false
  const vertices = collisionVertices(value)
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

function vectorCross(a: CollisionPoint, b: CollisionPoint): number {
  return a[0] * b[1] - a[1] * b[0]
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

function polygonPointLocation(
  polygon: readonly CollisionPoint[],
  point: CollisionPoint,
): PointLocation {
  let inside = false
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if (pointOnSegment(point, a, b)) return 'boundary'
    const crosses =
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] <
        ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside ? 'inside' : 'outside'
}

/** Strict containment in the existing collision outline. */
export function collisionBodyContainsPoint(
  body: unknown,
  x: number,
  y: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !usableCollisionBody(body)) return false
  return polygonPointLocation(collisionVertices(body), [x, y]) === 'inside'
}

function snappedDistance(distance: number, maxDistance: number): number {
  if (Math.abs(distance) <= SPATIAL_QUERY_EPSILON) return 0
  if (Math.abs(distance - maxDistance) <= SPATIAL_QUERY_EPSILON) return maxDistance
  return distance
}

function inRayRange(distance: number, maxDistance: number): boolean {
  return (
    distance >= -SPATIAL_QUERY_EPSILON &&
    distance <= maxDistance + SPATIAL_QUERY_EPSILON
  )
}

function onForwardRay(distance: number): boolean {
  return Number.isFinite(distance) && distance >= -SPATIAL_QUERY_EPSILON
}

function cleanUnitValue(value: number): number {
  return Math.abs(value) <= SPATIAL_QUERY_EPSILON ? 0 : value
}

function edgeNormal(
  a: CollisionPoint,
  b: CollisionPoint,
  winding: number,
): CollisionPoint | null {
  const edgeX = b[0] - a[0]
  const edgeY = b[1] - a[1]
  const length = Math.hypot(edgeX, edgeY)
  if (length <= SPATIAL_QUERY_EPSILON) return null
  return [
    cleanUnitValue((winding * edgeY) / length),
    cleanUnitValue((-winding * edgeX) / length),
  ]
}

function edgeEvents(
  origin: CollisionPoint,
  direction: CollisionPoint,
  maxDistance: number,
  a: CollisionPoint,
  b: CollisionPoint,
  normal: CollisionPoint,
  edgeOrder: number,
): EdgeEvent[] {
  const edge: CollisionPoint = [b[0] - a[0], b[1] - a[1]]
  const relative: CollisionPoint = [a[0] - origin[0], a[1] - origin[1]]
  const denominator = vectorCross(direction, edge)
  if (Math.abs(denominator) <= SPATIAL_QUERY_EPSILON) {
    if (Math.abs(vectorCross(relative, direction)) > SPATIAL_QUERY_EPSILON) return []
    const result: EdgeEvent[] = []
    for (const vertex of [a, b]) {
      const distance =
        (vertex[0] - origin[0]) * direction[0] +
        (vertex[1] - origin[1]) * direction[1]
      if (onForwardRay(distance)) {
        result.push({
          distance: snappedDistance(distance, maxDistance),
          edgeOrder,
        })
      }
    }
    return result
  }

  const distance = vectorCross(relative, edge) / denominator
  const edgeFraction = vectorCross(relative, direction) / denominator
  if (
    !onForwardRay(distance) ||
    !Number.isFinite(edgeFraction) ||
    edgeFraction < -SPATIAL_QUERY_EPSILON ||
    edgeFraction > 1 + SPATIAL_QUERY_EPSILON
  ) {
    return []
  }
  return [{
    distance: snappedDistance(distance, maxDistance),
    edgeOrder,
    normal,
  }]
}

function groupEvents(events: readonly EdgeEvent[]): EventGroup[] {
  const sorted = [...events].sort((a, b) =>
    a.distance === b.distance ? a.edgeOrder - b.edgeOrder : a.distance - b.distance,
  )
  const groups: Array<{
    distance: number
    normals: Array<{ edgeOrder: number; normal: CollisionPoint }>
  }> = []
  for (const event of sorted) {
    const current = groups.at(-1)
    if (!current || Math.abs(event.distance - current.distance) > SPATIAL_QUERY_EPSILON) {
      groups.push({ distance: event.distance, normals: [] })
    }
    if (event.normal) {
      groups.at(-1)!.normals.push({ edgeOrder: event.edgeOrder, normal: event.normal })
    }
  }
  return groups.map((group) => ({
    distance: group.distance,
    normals: group.normals.sort((a, b) => a.edgeOrder - b.edgeOrder),
  }))
}

function pointAlongRay(
  origin: CollisionPoint,
  direction: CollisionPoint,
  distance: number,
): CollisionPoint {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
  ]
}

function selectVertexNormal(
  normals: EventGroup['normals'],
  direction: CollisionPoint,
  crossing: 'entry' | 'exit',
): CollisionPoint | null {
  const first = normals[0]
  if (!first) return null
  let selected = first.normal
  let selectedDot = selected[0] * direction[0] + selected[1] * direction[1]
  for (const candidate of normals.slice(1)) {
    const dot = candidate.normal[0] * direction[0] + candidate.normal[1] * direction[1]
    const isBetter = crossing === 'entry'
      ? dot < selectedDot - SPATIAL_QUERY_EPSILON
      : dot > selectedDot + SPATIAL_QUERY_EPSILON
    if (isBetter) {
      selected = candidate.normal
      selectedDot = dot
    }
  }
  return selected
}

function polygonRay(
  body: CollisionBody,
  origin: CollisionPoint,
  direction: CollisionPoint,
  maxDistance: number,
): SpatialGeometryRayHit | null {
  const polygon = collisionVertices(body)
  if (!polygon.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return null
  const area = signedArea(polygon)
  if (Math.abs(area) <= SPATIAL_QUERY_EPSILON) return null
  const winding = area > 0 ? 1 : -1
  const events: EdgeEvent[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!
    const b = polygon[(index + 1) % polygon.length]!
    const normal = edgeNormal(a, b, winding)
    if (!normal) continue
    events.push(...edgeEvents(origin, direction, maxDistance, a, b, normal, index))
  }

  const groups = groupEvents(events)
  const originLocation = polygonPointLocation(polygon, origin)
  const scale = Math.max(Math.abs(body.width), Math.abs(body.height), 1)
  const terminalProbe = Math.max(
    SPATIAL_QUERY_EPSILON * 4,
    Math.min(scale * 1e-6, 1e-3),
  )
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!
    if (group.distance > maxDistance + SPATIAL_QUERY_EPSILON) break
    const previous = groups[index - 1]
    const next = groups[index + 1]
    const beforeLocation = group.distance === 0
      ? originLocation
      : polygonPointLocation(
          polygon,
          pointAlongRay(
            origin,
            direction,
            previous ? (previous.distance + group.distance) / 2 : group.distance / 2,
          ),
        )
    const afterLocation = polygonPointLocation(
      polygon,
      pointAlongRay(
        origin,
        direction,
        next ? (group.distance + next.distance) / 2 : group.distance + terminalProbe,
      ),
    )
    let crossing: 'entry' | 'exit' | null = null
    if (
      (beforeLocation === 'outside' ||
        (group.distance === 0 && beforeLocation === 'boundary')) &&
      afterLocation === 'inside'
    ) {
      crossing = 'entry'
    } else if (beforeLocation === 'inside' && afterLocation === 'outside') {
      crossing = 'exit'
    }
    if (!crossing) continue
    const normal = selectVertexNormal(group.normals, direction, crossing)
    if (!normal) continue
    const point = pointAlongRay(origin, direction, group.distance)
    return {
      distance: group.distance,
      point: { x: point[0], y: point[1] },
      normal: { x: normal[0], y: normal[1] },
    }
  }
  return null
}

function ellipseNormal(
  body: CollisionBody,
  radiusX: number,
  radiusY: number,
  point: CollisionPoint,
): CollisionPoint | null {
  const gradientX = ((point[0] - body.x) / radiusX) / radiusX
  const gradientY = ((point[1] - body.y) / radiusY) / radiusY
  const length = Math.hypot(gradientX, gradientY)
  if (!Number.isFinite(length) || length === 0) return null
  return [cleanUnitValue(gradientX / length), cleanUnitValue(gradientY / length)]
}

function ellipseRay(
  body: CollisionBody,
  origin: CollisionPoint,
  direction: CollisionPoint,
  maxDistance: number,
): SpatialGeometryRayHit | null {
  const radiusX = Math.abs(body.width) / 2
  const radiusY = Math.abs(body.height) / 2
  if (radiusX === 0 || radiusY === 0) return null
  const originX = (origin[0] - body.x) / radiusX
  const originY = (origin[1] - body.y) / radiusY
  const directionX = direction[0] / radiusX
  const directionY = direction[1] / radiusY
  const directionScale = Math.max(Math.abs(directionX), Math.abs(directionY))
  if (
    ![originX, originY, directionX, directionY, directionScale].every(Number.isFinite) ||
    directionScale === 0
  ) {
    return null
  }

  const scaledDirectionX = directionX / directionScale
  const scaledDirectionY = directionY / directionScale
  const directionLengthSquared =
    scaledDirectionX * scaledDirectionX + scaledDirectionY * scaledDirectionY
  const closestParameter = -(
    originX * scaledDirectionX + originY * scaledDirectionY
  ) / directionLengthSquared
  const perpendicular =
    originX * scaledDirectionY - originY * scaledDirectionX
  const radialGap = 1 - (perpendicular * perpendicular) / directionLengthSquared
  if (!Number.isFinite(closestParameter) || radialGap <= 0) return null

  const halfChordParameter = Math.sqrt(radialGap / directionLengthSquared)
  const halfChordDistance = halfChordParameter / directionScale
  if (
    !Number.isFinite(halfChordParameter) ||
    halfChordDistance <= SPATIAL_QUERY_EPSILON
  ) {
    return null
  }
  const roots = [
    (closestParameter - halfChordParameter) / directionScale,
    (closestParameter + halfChordParameter) / directionScale,
  ]
  const rawDistance = roots[0]! >= -SPATIAL_QUERY_EPSILON
    ? roots[0]!
    : roots[1]! > SPATIAL_QUERY_EPSILON
      ? roots[1]!
      : undefined
  if (rawDistance === undefined || !inRayRange(rawDistance, maxDistance)) return null
  const distance = snappedDistance(rawDistance, maxDistance)
  const point = pointAlongRay(origin, direction, distance)
  const normal = ellipseNormal(body, radiusX, radiusY, point)
  if (!normal) return null
  return {
    distance,
    point: { x: point[0], y: point[1] },
    normal: { x: normal[0], y: normal[1] },
  }
}

/** First strict crossing against one resolved body. Direction must be normalized. */
export function collisionBodyRay(
  body: unknown,
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxDistance: number,
): SpatialGeometryRayHit | null {
  if (!finiteCollisionBody(body)) return null
  const origin: CollisionPoint = [x, y]
  const direction: CollisionPoint = [dx, dy]
  return body.shape === 'circle'
    ? ellipseRay(body, origin, direction, maxDistance)
    : polygonRay(body, origin, direction, maxDistance)
}
