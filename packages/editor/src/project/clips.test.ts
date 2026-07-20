import { describe, expect, it } from 'vitest'
import { clipSummary, frameCount, sanitizeAnimated, uniqueClipName, type AnimatedProps } from './clips'

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
