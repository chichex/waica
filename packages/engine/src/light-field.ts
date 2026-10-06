/**
 * The CPU reference of a light-map texel (issue #78 CA-5..CA-7): what the
 * light shader computes per texel, written once in plain TypeScript so it
 * can be tested. The shader in `light-map-material.ts` follows it step by
 * step; this file is the specification both are read against.
 */

/** A light-map value or a light color: three multipliers in 0..1 over the sRGB frame. */
export type Rgb = [number, number, number]

/** One Light as the light-map sees it: logical position and radius, its look, its shadow. */
export interface LightField {
  x: number
  y: number
  /** Logical units: the same distance in every grid direction, also on an isometric screen. */
  radius: number
  color: Rgb
  intensity: number
  /** 0 = smooth falloff; N > 0 = N equal steps. */
  bands: number
  /** 0 = hard shadow edge; up to 1 = the widest penumbra. */
  softness: number
  castShadows: boolean
}

/**
 * Every Tilemap's solid tiles rasterized onto one logical grid: `solid` holds
 * one byte per cell, row-major, row 0 at `originY` (rows grow with y).
 */
export interface OccluderGrid {
  originX: number
  originY: number
  cellSize: number
  columns: number
  rows: number
  solid: Uint8Array
}

/**
 * How far a soft light's shadow samples sit from its centre, as a fraction
 * of its radius at softness 1: the penumbra of a torch of radius 4 spans
 * about one tile.
 */
export const SOFT_SHADOW_SPREAD = 0.25
/** Samples on the soft-shadow ring, besides the light's centre. */
export const SOFT_SHADOW_RING = 8

/**
 * Brightness at `t` = distance / radius: 1 at the centre, a smooth ease to 0
 * at the radius and nothing beyond. With `bands` > 0 every lit point takes
 * the top of its step, so the outermost band still reaches the radius.
 */
export function lightFalloff(t: number, bands: number): number {
  if (!(t < 1)) return 0
  const clamped = Math.max(0, t)
  const smooth = 1 - clamped * clamped * (3 - 2 * clamped)
  if (bands <= 0) return smooth
  return Math.ceil(smooth * bands) / bands
}

/** The render-space box a light covers: a circle's square, or the 2:1 ellipse's box on an isometric screen. */
export function lightFootprint(radius: number, projection: 'isometric' | null): { width: number; height: number } {
  if (projection === 'isometric') return { width: 2 * Math.SQRT2 * radius, height: Math.SQRT2 * radius }
  return { width: 2 * radius, height: 2 * radius }
}

function solidAt(grid: OccluderGrid, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return false
  return grid.solid[row * grid.columns + column] === 1
}

/** Where a segment's walk across the grid stands: its cell, and the next x and y crossings. */
interface GridWalk {
  column: number
  row: number
  nextX: number
  nextY: number
}

/** The ray parameter of the first cell boundary on one axis, and how much it grows per cell. */
function axisCrossing(start: number, delta: number, cell: number): { next: number; step: number } {
  if (delta === 0) return { next: Number.POSITIVE_INFINITY, step: Number.POSITIVE_INFINITY }
  const step = Math.abs(1 / delta)
  const toBoundary = delta > 0 ? cell + 1 - start : start - cell
  return { next: toBoundary * step, step }
}

/**
 * Whether the segment from a texel to a light crosses no solid cell other
 * than the texel's own (the lit face of a wall, CA-7). A grid walk
 * (Amanatides–Woo) over every cell the segment enters, the light's included.
 */
export function segmentClear(grid: OccluderGrid, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const ax = (fromX - grid.originX) / grid.cellSize
  const ay = (fromY - grid.originY) / grid.cellSize
  const bx = (toX - grid.originX) / grid.cellSize
  const by = (toY - grid.originY) / grid.cellSize
  const endColumn = Math.floor(bx)
  const endRow = Math.floor(by)
  const walk: GridWalk = { column: Math.floor(ax), row: Math.floor(ay), nextX: 0, nextY: 0 }
  const x = axisCrossing(ax, bx - ax, walk.column)
  const y = axisCrossing(ay, by - ay, walk.row)
  walk.nextX = x.next
  walk.nextY = y.next
  const stepColumn = Math.sign(bx - ax)
  const stepRow = Math.sign(by - ay)
  const cells = Math.abs(endColumn - walk.column) + Math.abs(endRow - walk.row)
  for (let index = 0; index < cells; index += 1) {
    if (walk.nextX < walk.nextY) {
      walk.column += stepColumn
      walk.nextX += x.step
    } else {
      walk.row += stepRow
      walk.nextY += y.step
    }
    if (solidAt(grid, walk.column, walk.row)) return false
  }
  return true
}

/**
 * How much of a light reaches a texel: 1 or 0 with a hard edge; with
 * softness, the share of sample points (the centre plus a ring around it)
 * the texel sees, so the shadow edge ramps.
 */
export function lightVisibility(grid: OccluderGrid | null, light: LightField, x: number, y: number): number {
  if (!grid || !light.castShadows) return 1
  const centre = segmentClear(grid, x, y, light.x, light.y) ? 1 : 0
  if (light.softness <= 0) return centre
  const spread = light.softness * light.radius * SOFT_SHADOW_SPREAD
  let seen = centre
  for (let sample = 0; sample < SOFT_SHADOW_RING; sample += 1) {
    const angle = (sample * 2 * Math.PI) / SOFT_SHADOW_RING
    const sx = light.x + Math.cos(angle) * spread
    const sy = light.y + Math.sin(angle) * spread
    if (segmentClear(grid, x, y, sx, sy)) seen += 1
  }
  return seen / (SOFT_SHADOW_RING + 1)
}

/** One light's own term at a logical point: color × intensity × falloff × visibility, never negative. */
function lightTerm(light: LightField, grid: OccluderGrid | null, x: number, y: number): Rgb {
  const strength = Math.max(0, light.intensity)
  const distance = Math.hypot(x - light.x, y - light.y)
  const reach = light.radius > 0 ? lightFalloff(distance / light.radius, light.bands) : 0
  if (strength === 0 || reach === 0) return [0, 0, 0]
  const amount = strength * reach * lightVisibility(grid, light, x, y)
  return [Math.max(0, light.color[0]) * amount, Math.max(0, light.color[1]) * amount, Math.max(0, light.color[2]) * amount]
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

/** A light-map texel at a logical point: the Ambient Light plus every light's term, clamped per channel. */
export function lightMapValue(
  ambient: Rgb,
  lights: readonly LightField[],
  grid: OccluderGrid | null,
  x: number,
  y: number,
): Rgb {
  const total: Rgb = [ambient[0], ambient[1], ambient[2]]
  for (const light of lights) {
    const [r, g, b] = lightTerm(light, grid, x, y)
    total[0] += r
    total[1] += g
    total[2] += b
  }
  return [clampUnit(total[0]), clampUnit(total[1]), clampUnit(total[2])]
}
