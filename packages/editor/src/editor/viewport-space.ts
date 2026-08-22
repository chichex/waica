import { projectIsometric, unprojectIsometric, type SceneRenderJson } from '@waica/engine'
import type { EditorBoxBounds } from './appearance-bounds'

export type ViewportProjection = SceneRenderJson['projection'] | null
export type Point2 = readonly [number, number]

/** Render-space pointer to the logical world used by authored transforms. */
export function logicalPoint(
  projection: ViewportProjection,
  renderX: number,
  renderY: number,
): [number, number] {
  if (projection !== 'isometric') return [renderX, renderY]
  const logical = unprojectIsometric(renderX, renderY)
  return [logical.x, logical.y]
}

/** Logical world point to the screen-space surface used by three.js. */
export function renderPoint(
  projection: ViewportProjection,
  logicalX: number,
  logicalY: number,
): [number, number] {
  if (projection !== 'isometric') return [logicalX, logicalY]
  const render = projectIsometric(logicalX, logicalY)
  return [render.x, render.y]
}

export function logicalVertices(
  projection: ViewportProjection,
  points: readonly Point2[],
): Array<[number, number]> {
  return points.map(([x, y]) => renderPoint(projection, x, y))
}

/** Axis-aligned render bounds translated by an entity's projected position. */
export function pickRenderBounds(
  projection: ViewportProjection,
  pointer: Readonly<{ x: number; y: number }>,
  logicalPosition: Readonly<{ x: number; y: number }>,
  bounds: EditorBoxBounds,
): boolean {
  const [entityX, entityY] = renderPoint(projection, logicalPosition.x, logicalPosition.y)
  const centerX = entityX + bounds.centerX
  const centerY = entityY + bounds.centerY
  return (
    Math.abs(pointer.x - centerX) <= bounds.width / 2 &&
    Math.abs(pointer.y - centerY) <= bounds.height / 2
  )
}
