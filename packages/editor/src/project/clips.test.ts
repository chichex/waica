import { describe, expect, it } from 'vitest'
import {
  clipSummary,
  dropFrame,
  frameCount,
  sanitizeAnimated,
  sheetsOf,
  toAnimatedProps,
  totalFrames,
  uniqueClipName,
  type AnimatedProps,
} from './clips'

const CELLS = [
  { x: 0, y: 0, width: 10, height: 12 },
  { x: 12, y: 0, width: 8, height: 12 },
  { x: 22, y: 0, width: 14, height: 12 },
]

function animated(overrides: Partial<AnimatedProps>): AnimatedProps {
  return { texture: '', cols: 4, rows: 2, clips: {}, width: 1, height: 1, ...overrides }
}

describe('frameCount', () => {
  it('multiplies the grid, clamped to at least 1x1', () => {
    expect(frameCount(4, 2)).toBe(8)
    expect(frameCount(0, 5)).toBe(5)
  })
})

describe('sanitizeAnimated', () => {
  it('drops out-of-range frames after a grid shrink', () => {
    const next = sanitizeAnimated(
      animated({ cols: 2, rows: 1, clips: { spin: { frames: [0, 1, 2, 3], fps: 8 } } }),
    )
    expect(next.clips.spin?.frames).toEqual([0, 1])
  })

  it('deletes clips left empty and clears a dangling initialClip', () => {
    const next = sanitizeAnimated(
      animated({ cols: 1, rows: 1, clips: { high: { frames: [7, 8], fps: 4 } }, initialClip: 'high' }),
    )
    expect(next.clips).toEqual({})
    expect(next.initialClip).toBeUndefined()
  })

  it('defaults initialClip to the first clip when unset', () => {
    const next = sanitizeAnimated(animated({ clips: { idle: { frames: [0], fps: 5 } } }))
    expect(next.initialClip).toBe('idle')
  })

  it('keeps a valid initialClip', () => {
    const next = sanitizeAnimated(
      animated({
        clips: { idle: { frames: [0], fps: 5 }, run: { frames: [1], fps: 10 } },
        initialClip: 'run',
      }),
    )
    expect(next.initialClip).toBe('run')
  })

  it('keeps positive slicing params and drops the rest', () => {
    const next = sanitizeAnimated(
      animated({ gridOffsetX: 44, spacingX: 14.5, gridOffsetY: 0, cellWidth: -3 }),
    )
    expect(next.gridOffsetX).toBe(44)
    expect(next.spacingX).toBe(14.5)
    expect('gridOffsetY' in next).toBe(false)
    expect('cellWidth' in next).toBe(false)
  })

  it('counts extra sheets into the frame range', () => {
    const next = sanitizeAnimated(
      animated({
        cols: 2,
        rows: 1,
        extraSheets: [{ texture: 'b.png', cols: 3, rows: 1 }],
        clips: { mixed: { frames: [1, 2, 4, 5], fps: 8 } },
      }),
    )
    // Frames 0-1 live on the main sheet, 2-4 on b.png; 5 is out of range.
    expect(next.clips.mixed?.frames).toEqual([1, 2, 4])
  })

  it('drops texture-less extra sheets along with their frames', () => {
    const next = sanitizeAnimated(
      animated({
        cols: 2,
        rows: 1,
        extraSheets: [{ texture: '', cols: 4, rows: 4 }],
        clips: { run: { frames: [1, 5], fps: 8 } },
      }),
    )
    expect('extraSheets' in next).toBe(false)
    expect(next.clips.run?.frames).toEqual([1])
  })

  it('sanitizes each extra sheet: grid clamped, non-positive slicing dropped', () => {
    const next = sanitizeAnimated(
      animated({
        extraSheets: [{ texture: 'b.png', cols: 0, rows: 2.9, gridOffsetX: -1, spacingY: 3 }],
      }),
    )
    expect(next.extraSheets).toEqual([{ texture: 'b.png', cols: 1, rows: 2, spacingY: 3 }])
  })

  it('explicit cells bound the frame range instead of the grid', () => {
    const next = sanitizeAnimated(
      animated({
        cols: 4,
        rows: 2,
        cells: CELLS,
        clips: { run: { frames: [0, 2, 5], fps: 8 } },
      }),
    )
    // 3 cells → frames 0-2; the grid's 8 no longer applies.
    expect(next.clips.run?.frames).toEqual([0, 2])
  })

  it('drops malformed cells, and the cells key when none survive', () => {
    const bad = { x: -1, y: 0, width: 0, height: 5 }
    const next = sanitizeAnimated(animated({ cells: [CELLS[0]!, bad] }))
    expect(next.cells).toEqual([CELLS[0]])
    expect('cells' in sanitizeAnimated(animated({ cells: [bad] }))).toBe(false)
  })
})

describe('dropFrame', () => {
  it('removes the frame everywhere and shifts later ones down', () => {
    const clips = {
      a: { frames: [0, 5, 6, 9], fps: 8 },
      b: { frames: [6, 3], fps: 8 },
    }
    const next = dropFrame(clips, 6)
    expect(next.a?.frames).toEqual([0, 5, 8])
    expect(next.b?.frames).toEqual([3])
  })
})

describe('sheetsOf / totalFrames', () => {
  it('lists the main sheet (with its slicing) before the extras', () => {
    const props = animated({
      texture: 'a.png',
      gridOffsetX: 44,
      extraSheets: [{ texture: 'b.png', cols: 3, rows: 1 }],
    })
    expect(sheetsOf(props)).toEqual([
      { texture: 'a.png', cols: 4, rows: 2, gridOffsetX: 44 },
      { texture: 'b.png', cols: 3, rows: 1 },
    ])
    expect(totalFrames(props)).toBe(11)
  })

  it('a cell sheet contributes its cell count', () => {
    const props = animated({
      texture: 'a.png',
      cells: CELLS,
      extraSheets: [{ texture: 'b.png', cols: 3, rows: 1 }],
    })
    expect(totalFrames(props)).toBe(6)
    expect(sheetsOf(props)[0]?.cells).toEqual(CELLS)
  })
})

describe('toAnimatedProps', () => {
  it('carries slicing params through, leaving absent ones unset', () => {
    const props = toAnimatedProps({ texture: 't.png', cols: 3, gridOffsetX: 44, cellHeight: 74 })
    expect(props.gridOffsetX).toBe(44)
    expect(props.cellHeight).toBe(74)
    expect('spacingX' in props).toBe(false)
  })

  it('keeps well-formed extra sheets and drops malformed entries', () => {
    const props = toAnimatedProps({
      texture: 't.png',
      extraSheets: [{ texture: 'b.png', cols: 2, rows: 1 }, { cols: 3 }],
    })
    expect(props.extraSheets).toEqual([{ texture: 'b.png', cols: 2, rows: 1 }])
    expect('extraSheets' in toAnimatedProps({ texture: 't.png' })).toBe(false)
  })
})

describe('clipSummary', () => {
  it('joins names or reports none', () => {
    expect(clipSummary({ idle: { frames: [0], fps: 5 }, run: { frames: [1], fps: 8 } })).toBe(
      'idle · run',
    )
    expect(clipSummary({})).toBe('no clips')
  })
})

describe('uniqueClipName', () => {
  it('suffixes until free', () => {
    const clips = { clip: { frames: [0], fps: 5 }, 'clip-2': { frames: [0], fps: 5 } }
    expect(uniqueClipName(clips, 'clip')).toBe('clip-3')
    expect(uniqueClipName(clips, 'idle')).toBe('idle')
  })
})
