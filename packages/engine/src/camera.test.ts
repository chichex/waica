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
      lookaheadY: CAMERA_DEFAULTS.lookaheadY,
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

describe('vertical lookahead', () => {
  it('fills lookaheadY with 0 by default and keeps a declared value', () => {
    expect(resolveSceneCamera().lookaheadY).toBe(0)
    expect(resolveSceneCamera({ lookaheadY: 2 }).lookaheadY).toBe(2)
  })

  it('adds vertical lookahead in the direction of travel', () => {
    const cam = resolveSceneCamera({
      follow: 'Player',
      smoothing: 1000,
      deadzoneHeight: 0,
      lookaheadY: 2,
    })
    const still = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0, y: 5 } })
    const rising = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0, y: 5 }, vy: 8 })
    const dropping = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0, y: 5 }, vy: -8 })
    expect(rising.y).toBeCloseTo(still.y + cam.lookaheadY, 3)
    expect(dropping.y).toBeCloseTo(still.y - cam.lookaheadY, 3)
  })

  it('ignores vertical speed at or below the 1-unit threshold', () => {
    const cam = resolveSceneCamera({
      follow: 'Player',
      smoothing: 1000,
      deadzoneHeight: 0,
      lookaheadY: 2,
    })
    const atThreshold = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0, y: 5 }, vy: 1 })
    expect(atThreshold.y).toBeCloseTo(5, 3)
  })

  it('gives a scene that declares no lookaheadY none, regardless of vy', () => {
    const cam = resolveSceneCamera({ follow: 'Player', smoothing: 1000, deadzoneHeight: 0 })
    const rising = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 0, y: 5 }, vy: 30 })
    expect(rising.y).toBeCloseTo(5, 3)
  })
})

// Golden pins of the exact outputs platformer scenes get today. A camera block
// that never declares vertical lookahead must keep producing these numbers.
describe('stepSceneCamera golden values for platformer-shaped scenes', () => {
  it('pins one chase step of the shipped platformer camera', () => {
    // The exact camera block @waica/archetype-platformer ships in its scene.
    const cam = resolveSceneCamera({
      position: [0, -1],
      zoom: 12,
      follow: 'Player',
      limits: { minX: -16, maxX: 26, minY: -7, maxY: 5 },
    })
    const next = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 6, y: 3 }, vx: 8 })
    expect(next.x).toBeCloseTo(0.6185567827662631, 12)
    // The platformer limits span exactly the view height, so y centers on them.
    expect(next.y).toBeCloseTo(-1, 12)
  })

  it('pins one chase step with default camera settings and no limits', () => {
    const cam = resolveSceneCamera({ follow: 'Player' })
    const next = stepSceneCamera(cam, { ...VIEW, x: 2, y: 1, target: { x: 9, y: 7 }, vx: -3 })
    expect(next.x).toBeCloseTo(2.4282316188381823, 12)
    expect(next.y).toBeCloseTo(1.4520222643291922, 12)
  })

  it('pins ten iterated steps converging on a still target', () => {
    const cam = resolveSceneCamera({ follow: 'Player' })
    let center = { x: 0, y: 0 }
    for (let i = 0; i < 10; i++) {
      center = stepSceneCamera(cam, { ...VIEW, ...center, target: { x: 10, y: 0 } })
    }
    expect(center.x).toBeCloseTo(5.689085029457021, 12)
    expect(center.y).toBeCloseTo(0, 12)
  })

  it('pins the lookahead threshold: |vx| of exactly 1 adds none', () => {
    const cam = resolveSceneCamera({ follow: 'Player', smoothing: 1000, deadzoneWidth: 0 })
    const atThreshold = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 5, y: 0 }, vx: 1 })
    const above = stepSceneCamera(cam, { ...VIEW, x: 0, y: 0, target: { x: 5, y: 0 }, vx: 1.01 })
    expect(atThreshold.x).toBeCloseTo(5, 3)
    expect(above.x).toBeCloseTo(5 + cam.lookahead, 3)
  })
})
