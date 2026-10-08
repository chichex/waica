import { describe, expect, it } from 'vitest'
import {
  lightFalloff,
  lightFootprint,
  lightMapValue,
  lightVisibility,
  type LightField,
  type OccluderGrid,
} from './light-field.js'

/** A torch: white, full intensity, radius 4, smooth, hard shadows. */
function torch(overrides: Partial<LightField> = {}): LightField {
  return {
    x: 0,
    y: 0,
    radius: 4,
    color: [1, 1, 1],
    intensity: 1,
    bands: 0,
    softness: 0,
    castShadows: true,
    ...overrides,
  }
}

const DARK: [number, number, number] = [0, 0, 0]

/** A 9x9 grid of unit cells with its origin at (-4.5, -4.5), so cell (4, 4) holds the logical origin. */
function grid(solidCells: Array<[number, number]>): OccluderGrid {
  const solid = new Uint8Array(81)
  for (const [column, row] of solidCells) solid[row * 9 + column] = 1
  return { originX: -4.5, originY: -4.5, cellSize: 1, columns: 9, rows: 9, solid }
}

describe('lightFalloff (CA-5)', () => {
  it('is 1 at the centre, 0.5 at mid-radius, 0 at the radius edge and beyond', () => {
    expect(lightFalloff(0, 0)).toBe(1)
    expect(lightFalloff(0.5, 0)).toBe(0.5)
    expect(lightFalloff(1, 0)).toBe(0)
    expect(lightFalloff(1.5, 0)).toBe(0)
  })

  it('falls smoothly: monotonic, with a flat start and a flat edge', () => {
    expect(lightFalloff(0.25, 0)).toBeCloseTo(0.84375, 10)
    expect(lightFalloff(0.75, 0)).toBeCloseTo(0.15625, 10)
  })

  it('splits into `bands` equal steps, each lit point taking its step', () => {
    expect(lightFalloff(0, 3)).toBe(1)
    expect(lightFalloff(0.5, 3)).toBeCloseTo(2 / 3, 10)
    expect(lightFalloff(0.75, 3)).toBeCloseTo(1 / 3, 10)
    expect(lightFalloff(0.95, 3)).toBeCloseTo(1 / 3, 10)
    expect(lightFalloff(1, 3)).toBe(0)
  })
})

describe('lightMapValue (CA-5)', () => {
  it('is the Ambient Light alone where no light reaches', () => {
    expect(lightMapValue({ ambient: [0.2, 0.25, 0.3], lights: [torch()], grid: null }, { x: 10, y: 0 })).toEqual([0.2, 0.25, 0.3])
  })

  it('adds color × intensity × falloff to the ambient, per channel, clamped to 1', () => {
    const warm = torch({ color: [1, 0.5, 0.25], intensity: 0.8 })
    const [r, g, b] = lightMapValue({ ambient: [0.1, 0.1, 0.1], lights: [warm], grid: null }, { x: 2, y: 0 })
    expect(r).toBeCloseTo(0.1 + 0.8 * 0.5, 10)
    expect(g).toBeCloseTo(0.1 + 0.4 * 0.5, 10)
    expect(b).toBeCloseTo(0.1 + 0.2 * 0.5, 10)
    expect(lightMapValue({ ambient: [0.5, 0.5, 0.5], lights: [torch({ intensity: 3 })], grid: null }, { x: 0, y: 0 })).toEqual([1, 1, 1])
  })

  it('never darkens: a light of intensity 0 or a negative color leaves the ambient', () => {
    const ambient: [number, number, number] = [0.3, 0.3, 0.3]
    expect(lightMapValue({ ambient, lights: [torch({ intensity: 0 })], grid: null }, { x: 0, y: 0 })).toEqual(ambient)
    expect(lightMapValue({ ambient, lights: [torch({ color: [-1, -1, -1] })], grid: null }, { x: 0, y: 0 })).toEqual(ambient)
  })

  it('sums several lights', () => {
    const left = torch({ x: -2 })
    const right = torch({ x: 2 })
    const [r] = lightMapValue({ ambient: DARK, lights: [left, right], grid: null }, { x: 0, y: 0 })
    expect(r).toBeCloseTo(1, 10)
  })
})

describe('isometric radius (CA-6)', () => {
  it('reaches the same distance in every logical grid direction', () => {
    const light = torch({ x: 3, y: 3 })
    const values = [[3 + 2, 3], [3 - 2, 3], [3, 3 + 2], [3, 3 - 2]].map(([x, y]) =>
      lightMapValue({ ambient: DARK, lights: [light], grid: null }, { x: x ?? 0, y: y ?? 0 })[0],
    )
    expect(new Set(values)).toEqual(new Set([0.5]))
  })

  it('covers a 2:1 ellipse on an isometric screen, a circle otherwise', () => {
    expect(lightFootprint(4, null)).toEqual({ width: 8, height: 8 })
    const iso = lightFootprint(4, 'isometric')
    expect(iso.width).toBeCloseTo(8 * Math.SQRT2, 10)
    expect(iso.height).toBeCloseTo(4 * Math.SQRT2, 10)
  })
})

describe('lightVisibility (CA-7)', () => {
  it('is 1 with no occluders', () => {
    expect(lightVisibility(null, torch(), { x: 3, y: 0 })).toBe(1)
  })

  it('is 0 behind a solid tile and 1 on the tile itself (its lit face)', () => {
    // A wall cell two to the right of the light, which sits in cell (4, 4).
    const wall = grid([[6, 4]])
    expect(lightVisibility(wall, torch(), { x: 1, y: 0 })).toBe(1)
    expect(lightVisibility(wall, torch(), { x: 2, y: 0 })).toBe(1)
    expect(lightVisibility(wall, torch(), { x: 3, y: 0 })).toBe(0)
    expect(lightVisibility(wall, torch(), { x: 3, y: 1.2 })).toBe(1)
  })

  it('blocks a diagonal ray crossing a solid cell, not one passing beside it', () => {
    const wall = grid([[5, 5]])
    expect(lightVisibility(wall, torch(), { x: 2, y: 2 })).toBe(0)
    expect(lightVisibility(wall, torch(), { x: 2, y: -2 })).toBe(1)
  })

  it('ignores occluders for a light with castShadows false', () => {
    const wall = grid([[6, 4]])
    expect(lightVisibility(wall, torch({ castShadows: false }), { x: 3, y: 0 })).toBe(1)
  })

  it('ramps instead of stepping with softness above 0', () => {
    const wall = grid([[6, 4]])
    const across = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 2, 3]
    const hard = across.map((y) => lightVisibility(wall, torch(), { x: 3, y }))
    const soft = across.map((y) => lightVisibility(wall, torch({ softness: 1 }), { x: 3, y }))
    expect(hard.every((value) => value === 0 || value === 1)).toBe(true)
    expect(soft.some((value) => value > 0 && value < 1)).toBe(true)
    for (let index = 1; index < soft.length; index += 1) {
      expect(soft[index]).toBeGreaterThanOrEqual(soft[index - 1] ?? 0)
    }
    expect(soft.at(-1)).toBe(1)
  })

  it('treats cells outside the grid as open', () => {
    expect(lightVisibility(grid([]), torch({ x: 20 }), { x: 22, y: 0 })).toBe(1)
  })

  it('darkens the light-map behind the wall to the ambient', () => {
    const wall = grid([[6, 4]])
    expect(lightMapValue({ ambient: [0.1, 0.1, 0.1], lights: [torch()], grid: wall }, { x: 3, y: 0 })).toEqual([0.1, 0.1, 0.1])
  })
})

/** The dungeon demo's grid: a 10x10 border ring and a wall down column 5, open at row 8. */
function dungeonGrid(): OccluderGrid {
  const solid = new Uint8Array(100)
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const border = column === 0 || row === 0 || column === 9 || row === 9
      if (border || (column === 5 && row !== 8)) solid[row * 10 + column] = 1
    }
  }
  return { originX: 0, originY: 0, cellSize: 1, columns: 10, rows: 10, solid }
}

/** Visibility on a 1/8-cell lattice over the room's floor: lines of values, split at solid cells (walls keep their lit-face rule). */
function floorLines(light: LightField): number[][] {
  const grid = dungeonGrid()
  const steps = Array.from({ length: 64 }, (_, i) => 1 + (i + 0.5) / 8)
  const solidAt = (x: number, y: number): boolean => grid.solid[Math.floor(y) * 10 + Math.floor(x)] === 1
  const lines: number[][] = []
  const sweep = (points: Array<{ x: number; y: number }>): void => {
    let run: number[] = []
    for (const point of points) {
      if (solidAt(point.x, point.y)) {
        lines.push(run)
        run = []
      } else {
        run.push(lightVisibility(grid, light, point))
      }
    }
    lines.push(run)
  }
  for (const y of steps) sweep(steps.map((x) => ({ x, y })))
  for (const x of steps) sweep(steps.map((y) => ({ x, y })))
  return lines
}

/** How often a run of values turns from rising to falling or back. */
function reversals(values: readonly number[]): number {
  let count = 0
  let direction = 0
  for (let i = 1; i < values.length; i += 1) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0)
    if (delta === 0) continue
    const sign = Math.sign(delta)
    if (direction !== 0 && sign !== direction) count += 1
    direction = sign
  }
  return count
}

for (const softness of [0.25, 1]) {
  it(`lightVisibility (review round 3): softness ${softness} is one smooth transition on the floor, not a staircase of hard edges`, () => {
    const lines = floorLines(torch({ x: 3.5, y: 6.5, radius: 4.5, softness }))
    expect(lines.reduce((sum, line) => sum + reversals(line), 0)).toBe(0)
    // Nine overlapping hard shadows give at most eight levels between 0 and 1 (k/9): the fan.
    const levels = new Set(lines.flat().filter((value) => value > 0 && value < 1).map((value) => value.toFixed(3)))
    expect(levels.size).toBeGreaterThan(9)
  })
}
