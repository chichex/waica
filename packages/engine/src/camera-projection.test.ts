import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { isPerspectiveCamera, pixelsPerUnit, worldToNormalized } from './camera-projection.js'
import { placePerspectiveCamera, resolvePerspectiveCamera } from './scene-camera-3d.js'

/** The Pointer's screen→world mapping and the Anchored Pieces' inverse, as written before this helper existed. */
function legacyAnchoredFormula(
  camera: { position: { x: number; y: number }; left: number; right: number; top: number; bottom: number },
  point: { x: number; y: number },
): { nx: number; ny: number } {
  return {
    nx: (point.x - (camera.position.x + camera.left)) / (camera.right - camera.left),
    ny: (camera.position.y + camera.top - point.y) / (camera.top - camera.bottom),
  }
}

describe('worldToNormalized, orthographic camera (CA-6)', () => {
  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5)
  camera.position.set(3, -2, 10)

  it('reproduces the legacy formula on a grid of points, z ignored', () => {
    for (let x = -12; x <= 18; x += 1.5) {
      for (let y = -10; y <= 8; y += 1.25) {
        const expected = legacyAnchoredFormula(camera, { x, y })
        expect(worldToNormalized(camera, { x, y })).toEqual(expected)
        expect(worldToNormalized(camera, { x, y, z: 99 })).toEqual(expected)
      }
    }
  })

  it('works on a duck-typed camera, as the Pointer and Anchored Pieces tests use', () => {
    const duck = { position: { x: 0, y: 0 }, left: -5, right: 5, top: 5, bottom: -5 }
    expect(isPerspectiveCamera(duck)).toBe(false)
    expect(worldToNormalized(duck, { x: 0, y: 0 })).toEqual({ nx: 0.5, ny: 0.5 })
    expect(worldToNormalized(duck, { x: -5, y: 5 })).toEqual({ nx: 0, ny: 0 })
  })
})

describe('worldToNormalized, perspective camera (CA-6)', () => {
  const camera = new THREE.PerspectiveCamera()
  placePerspectiveCamera(camera, resolvePerspectiveCamera({ kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60, near: 0.1, far: 100 }), 16 / 9)

  it('is recognised as perspective', () => {
    expect(isPerspectiveCamera(camera)).toBe(true)
    expect(isPerspectiveCamera(new THREE.OrthographicCamera())).toBe(false)
  })

  it('puts the look-at target in the middle of the view', () => {
    const point = worldToNormalized(camera, { x: 0, y: 0, z: 0 })
    expect(point?.nx).toBeCloseTo(0.5)
    expect(point?.ny).toBeCloseTo(0.5)
  })

  it('maps +x to the right and +y to the top, with the vertical fov deciding the scale', () => {
    // tan(30°) · distance 10 = the half height of the view at the target's depth.
    const halfHeight = Math.tan(Math.PI / 6) * 10
    const top = worldToNormalized(camera, { x: 0, y: halfHeight, z: 0 })
    expect(top?.ny).toBeCloseTo(0)
    const right = worldToNormalized(camera, { x: halfHeight * (16 / 9), y: 0, z: 0 })
    expect(right?.nx).toBeCloseTo(1)
  })

  it('shrinks with distance: a farther point sits closer to the centre', () => {
    const near = worldToNormalized(camera, { x: 2, y: 0, z: 5 })
    const far = worldToNormalized(camera, { x: 2, y: 0, z: -20 })
    expect(near && far && near.nx > far.nx).toBe(true)
  })

  it('treats a missing z as 0', () => {
    expect(worldToNormalized(camera, { x: 1, y: 1 })).toEqual(worldToNormalized(camera, { x: 1, y: 1, z: 0 }))
  })

  it('is null for a point behind the camera and for one inside the near plane', () => {
    expect(worldToNormalized(camera, { x: 0, y: 0, z: 20 })).toBeNull()
    expect(worldToNormalized(camera, { x: 0, y: 0, z: 9.95 })).toBeNull()
  })
})

describe('pixelsPerUnit, perspective camera whose origin is behind it', () => {
  it('stays near the scale at the look distance instead of collapsing to the near plane', () => {
    const facing = new THREE.PerspectiveCamera()
    placePerspectiveCamera(facing, resolvePerspectiveCamera({ kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0] }), 16 / 9)
    const away = new THREE.PerspectiveCamera()
    placePerspectiveCamera(away, resolvePerspectiveCamera({ kind: 'perspective', position: [0, 5, 10], target: [0, 0, 20] }), 16 / 9)
    const scale = pixelsPerUnit(facing, 600)
    const behind = pixelsPerUnit(away, 600)
    expect(scale).toBeGreaterThan(30)
    expect(scale).toBeLessThan(80)
    // The origin is ~11 units from the camera either way: the same order of magnitude, never ~5000.
    expect(behind).toBeGreaterThan(30)
    expect(behind).toBeLessThan(80)
  })
})
