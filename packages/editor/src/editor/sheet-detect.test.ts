import { describe, expect, it } from 'vitest'
import { detectCells, type AlphaMap } from './sheet-detect'

/** Builds an alpha map from ascii art: '#' is opaque, anything else clear. */
function map(rows: string[]): AlphaMap {
  const width = rows[0]!.length
  const height = rows.length
  const alpha = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) alpha[y * width + x] = row[x] === '#' ? 255 : 0
  })
  return { width, height, alpha }
}

describe('detectCells', () => {
  it('snaps uniform-pitch frames to equal boxes on that pitch', () => {
    const cells = detectCells(
      map([
        '..............................',
        '..####......####......####....',
        '..####......####......####....',
        '..####......####......####....',
        '..............................',
        '..............................',
      ]),
    )
    expect(cells).toEqual([
      { x: 0, y: 0, width: 8, height: 6 },
      { x: 10, y: 0, width: 8, height: 6 },
      { x: 20, y: 0, width: 8, height: 6 },
    ])
  })

  it('keeps equal box sizes when frame widths wobble — the anti-jitter guarantee', () => {
    // Content widths 4/6/4 but centers on an exact pitch of 12: the boxes must
    // all match in size and spacing so the quad never rescales frame-to-frame.
    const cells = detectCells(
      map([
        '........................................',
        '...####.......######.......####.........',
        '...####.......######.......####.........',
        '...####.......######.......####.........',
        '...####.......######.......####.........',
        '........................................',
        '........................................',
      ]),
    )
    expect(cells).toHaveLength(3)
    const [a, b, c] = cells
    expect(new Set(cells.map((cell) => `${cell.width}x${cell.height}`)).size).toBe(1)
    expect(b!.x - a!.x).toBe(c!.x - b!.x)
    // Every frame's content stays inside its box.
    expect(a!.x).toBeLessThanOrEqual(3)
    expect(a!.x + a!.width).toBeGreaterThanOrEqual(7)
    expect(b!.x).toBeLessThanOrEqual(14)
    expect(b!.x + b!.width).toBeGreaterThanOrEqual(20)
    expect(c!.x).toBeLessThanOrEqual(27)
    expect(c!.x + c!.width).toBeGreaterThanOrEqual(31)
  })

  it('keeps per-frame padded boxes when the pitch is not uniform (packed sheets)', () => {
    const cells = detectCells(
      map([
        '........................................',
        '.####...####..................####......',
        '.####...####..................####......',
        '.####...####..................####......',
        '........................................',
      ]),
    )
    expect(cells).toEqual([
      { x: 0, y: 0, width: 7, height: 5 },
      { x: 6, y: 0, width: 8, height: 5 },
      { x: 28, y: 0, width: 8, height: 5 },
    ])
  })

  it('handles bands independently, top-to-bottom', () => {
    const cells = detectCells(
      map([
        '.####...####.',
        '.####...####.',
        '.####...####.',
        '.............',
        '.####........',
        '.####...####.',
        '.####...####.',
        '.####...####.',
      ]),
    )
    expect(cells).toEqual([
      { x: 0, y: 0, width: 8, height: 5 },
      { x: 5, y: 0, width: 8, height: 5 },
      { x: 0, y: 2, width: 8, height: 6 },
      { x: 5, y: 2, width: 8, height: 6 },
    ])
  })

  it('ignores export dust smaller than the minimum size', () => {
    const cells = detectCells(
      map([
        '..........',
        '.####...#.',
        '.####.....',
        '.####.....',
        '..........',
      ]),
    )
    expect(cells).toEqual([{ x: 0, y: 0, width: 7, height: 5 }])
  })

  it('finds nothing on a fully transparent image', () => {
    expect(detectCells(map(['....', '....']))).toEqual([])
  })
})
