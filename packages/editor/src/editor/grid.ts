import { projectIsometric, unprojectIsometric } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'

/**
 * Grid math for the edit viewport, dispatched on the grid type: the
 * viewport only consumes these functions, so the isometric grid (H5)
 * lands as another case here — a diamond lattice in gridLineVertices
 * and coupled axes in snapPoint — without touching the viewport.
 */
export type GridSpec = Pick<GridSettings, 'type' | 'size'>

export interface WorldRect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Whether a drag snaps right now: the toggle, inverted while Shift is held. */
export function snapActive(snap: boolean, shiftKey: boolean): boolean {
  return snap !== shiftKey
}

/** The grid vertex nearest to a render-space point. */
export function snapPoint(spec: GridSpec, x: number, y: number): [number, number] {
  if (spec.type === 'square') {
    return [Math.round(x / spec.size) * spec.size, Math.round(y / spec.size) * spec.size]
  }
  const logical = unprojectIsometric(x, y)
  const projected = projectIsometric(
    Math.round(logical.x / spec.size) * spec.size,
    Math.round(logical.y / spec.size) * spec.size,
  )
  return [projected.x, projected.y]
}

/** The rect's logical cover in whole cell indices: same cover ⇒ identical lines. */
function cover(spec: GridSpec, rect: WorldRect) {
  if (spec.type === 'square') {
    return {
      minX: Math.floor(rect.minX / spec.size),
      maxX: Math.ceil(rect.maxX / spec.size),
      minY: Math.floor(rect.minY / spec.size),
      maxY: Math.ceil(rect.maxY / spec.size),
    }
  }
  const corners = [
    unprojectIsometric(rect.minX, rect.minY),
    unprojectIsometric(rect.minX, rect.maxY),
    unprojectIsometric(rect.maxX, rect.minY),
    unprojectIsometric(rect.maxX, rect.maxY),
  ]
  return {
    minX: Math.floor(Math.min(...corners.map(({ x }) => x)) / spec.size),
    maxX: Math.ceil(Math.max(...corners.map(({ x }) => x)) / spec.size),
    minY: Math.floor(Math.min(...corners.map(({ y }) => y)) / spec.size),
    maxY: Math.ceil(Math.max(...corners.map(({ y }) => y)) / spec.size),
  }
}

/** Overlay rebuild key: regenerate the geometry only when this changes. */
export function gridCoverKey(spec: GridSpec, rect: WorldRect): string {
  const c = cover(spec, rect)
  return `${spec.type}:${spec.size}:${c.minX}:${c.maxX}:${c.minY}:${c.maxY}`
}

/** Segment endpoints (x,y,z vertex triples) drawing the grid over the rect. */
export function gridLineVertices(spec: GridSpec, rect: WorldRect): Float32Array {
  const c = cover(spec, rect)
  const s = spec.size
  const cols = c.maxX - c.minX + 1
  const rows = c.maxY - c.minY + 1
  const out = new Float32Array((cols + rows) * 6)
  let i = 0
  const point = (logicalX: number, logicalY: number): void => {
    const projected = projectIsometric(logicalX, logicalY)
    out[i++] = projected.x
    out[i++] = projected.y
    out[i++] = 0
  }
  for (let x = c.minX; x <= c.maxX; x++) {
    if (spec.type === 'square') {
      out[i++] = x * s
      out[i++] = c.minY * s
      out[i++] = 0
      out[i++] = x * s
      out[i++] = c.maxY * s
      out[i++] = 0
    } else {
      point(x * s, c.minY * s)
      point(x * s, c.maxY * s)
    }
  }
  for (let y = c.minY; y <= c.maxY; y++) {
    if (spec.type === 'square') {
      out[i++] = c.minX * s
      out[i++] = y * s
      out[i++] = 0
      out[i++] = c.maxX * s
      out[i++] = y * s
      out[i++] = 0
    } else {
      point(c.minX * s, y * s)
      point(c.maxX * s, y * s)
    }
  }
  return out
}
