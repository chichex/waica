import { describe, expect, it } from 'vitest'
import { CAMERA_DEFAULTS, resolveSceneCamera, stepSceneCamera } from './camera'

const VIEW = { halfW: 8, halfH: 6, vx: 0, dt: 1 / 60 }

describe('resolveSceneCamera', () => {
  it('fills an empty block with the engine defaults', () => {
    expect(resolveSceneCamera()).toEqual({
      position: CAMERA_DEFAULTS.position,
      zoom: CAMERA_DEFAULTS.zoom,
      follow: '',
      deadzoneWidth: CAMERA_DEFAULTS.deadzoneWidth,
      deadzoneHeight: CAMERA_DEFAULTS.deadzoneHeight,
      lookahead: CAMERA_DEFAULTS.lookahead,
      smoothing: CAMERA_DEFAULTS.smoothing,
      limits: null,
    })
  })

  it('keeps declared values over the defaults', () => {
    const cam = resolveSceneCamera({ zoom: 20, follow: 'Player' })
    expect(cam.zoom).toBe(20)
    expect(cam.follow).toBe('Player')
    expect(cam.smoothing).toBe(CAMERA_DEFAULTS.smoothing)
  })
})

describe('stepSceneCamera', () => {
  it('stays put while the target is inside the deadzone', () => {
    const cam = resolveSceneCamera({ follow: 'Player' })
    const next = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0.5, y: 0.5 } })
    expect(next).toEqual({ x: 0, y: 0 })
  })

  it('chases a target that left the deadzone', () => {
    const cam = resolveSceneCamera({ follow: 'Player', smoothing: 1000 })
    const next = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 10, y: 0 } })
    // With near-instant smoothing the camera lands at target minus half deadzone.
    expect(next.x).toBeCloseTo(10 - cam.deadzoneWidth / 2, 3)
    expect(next.y).toBe(0)
  })

  it('adds lookahead in the direction of travel', () => {
    const cam = resolveSceneCamera({ follow: 'Player', smoothing: 1000, deadzoneWidth: 0 })
    const still = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 5, y: 0 } })
    const moving = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 5, y: 0 }, vx: 8 })
    expect(moving.x).toBeCloseTo(still.x + cam.lookahead, 3)
  })

  it('does not move a camera without follow target', () => {
    const cam = resolveSceneCamera({})
    const next = stepSceneCamera(cam, { ...VIEW, x: 3, y: -2, target: null })
    expect(next).toEqual({ x: 3, y: -2 })
  })

  it('clamps the view inside the limits', () => {
    const cam = resolveSceneCamera({ limits: { minX: -20, maxX: 20, minY: -10, maxY: 10 } })
    const next = stepSceneCamera(cam, { ...VIEW, x: -30, y: 30, target: null })
    // halfW 8 → center can go down to -20 + 8; halfH 6 → up to 10 - 6.
    expect(next).toEqual({ x: -12, y: 4 })
  })

  it('centers on limits narrower than the view', () => {
    const cam = resolveSceneCamera({ limits: { minX: -2, maxX: 2, minY: -1, maxY: 3 } })
    const next = stepSceneCamera(cam, { ...VIEW, x: -30, y: 30, target: null })
    expect(next).toEqual({ x: 0, y: 1 })
  })

  it('applies limits after the follow step', () => {
    const cam = resolveSceneCamera({
      follow: 'Player',
      smoothing: 1000,
      limits: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    })
    const next = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 50, y: 0 } })
    expect(next.x).toBe(10 - VIEW.halfW)
  })
})
