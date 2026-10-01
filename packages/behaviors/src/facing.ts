import { screenInputToLogical, type ProjectedPoint } from '@waica/engine'

/** The eight screen-relative facings a directional contract can declare. */
export type ScreenFacing = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export const SCREEN_FACINGS: readonly ScreenFacing[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** Facing → screen sign pair (x right, y up), the inverse of facingForInput. */
const FACING_VECTORS: Readonly<Record<ScreenFacing, ProjectedPoint>> = {
  n: { x: 0, y: 1 },
  ne: { x: 1, y: 1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: -1 },
  s: { x: 0, y: -1 },
  sw: { x: -1, y: -1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: 1 },
}

/** Counter-clockwise from east, one per 45° sector of the input angle. */
const FACINGS_BY_SECTOR: readonly ScreenFacing[] = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']

/**
 * The eight-way facing a screen-relative input reads as: the 45° sector its
 * angle falls in, so an almost-vertical stick faces `n`, not `ne`; every
 * keyboard input (components in {-1, 0, 1}) lands on its sign pair exactly.
 * Undefined for no input, which lets the caller keep whatever it was facing.
 */
export function facingForInput(inputX: number, inputY: number): ScreenFacing | undefined {
  if (inputX === 0 && inputY === 0) return undefined
  const sector = Math.round(Math.atan2(inputY, inputX) / (Math.PI / 4))
  return FACINGS_BY_SECTOR[(sector + 8) % 8]
}

/** The screen sign pair behind a facing; undefined for a name the table lacks. */
export function facingVector(facing: string): ProjectedPoint | undefined {
  const vector = FACING_VECTORS[facing as ScreenFacing]
  return vector ? { ...vector } : undefined
}

/**
 * The unit vector a facing points along in the scene's logical space: the
 * screen vector itself without a projection, or its image on the logical
 * diamond under the isometric one — the same mapping the motors move along.
 */
export function logicalDirection(
  facing: string,
  projection: 'isometric' | null,
): ProjectedPoint | undefined {
  const vector = facingVector(facing)
  if (!vector) return undefined
  if (projection === 'isometric') return screenInputToLogical(vector.x, vector.y)
  const length = Math.hypot(vector.x, vector.y)
  return { x: vector.x / length, y: vector.y / length }
}
