import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { resolveSceneCamera } from './camera.js'
import {
  PERSPECTIVE_DEFAULTS,
  perspectiveCameraIssues,
  placePerspectiveCamera,
  resolvePerspectiveCamera,
} from './scene-camera-3d.js'

describe('resolveSceneCamera, perspective block (CA-2)', () => {
  it('fills an empty perspective block with the engine defaults (inference 2)', () => {
    expect(resolveSceneCamera({ kind: 'perspective' })).toEqual({
      kind: 'perspective',
      position: [0, 5, 10],
      target: [0, 0, 0],
      fov: 60,
      near: 0.1,
      far: 1000,
    })
    expect(PERSPECTIVE_DEFAULTS.fov).toBe(60)
  })

  it('keeps declared values over the defaults', () => {
    const camera = resolveSceneCamera({ kind: 'perspective', position: [1, 2, 3], target: [4, 5, 6], fov: 40, near: 0.5, far: 50 })
    expect(camera).toEqual({ kind: 'perspective', position: [1, 2, 3], target: [4, 5, 6], fov: 40, near: 0.5, far: 50 })
  })

  it('leaves the orthographic block exactly as before: no kind in the result', () => {
    expect(resolveSceneCamera({ kind: 'orthographic', zoom: 20 })).not.toHaveProperty('kind')
    expect(resolveSceneCamera({ zoom: 20 }).zoom).toBe(20)
  })

  it('resolvePerspectiveCamera is the same resolution for a perspective block', () => {
    expect(resolvePerspectiveCamera({ kind: 'perspective' })).toEqual(resolveSceneCamera({ kind: 'perspective' }))
  })
})

describe('placePerspectiveCamera (CA-2)', () => {
  it('positions the camera and looks at the target with fov, near and far', () => {
    const camera = new THREE.PerspectiveCamera()
    placePerspectiveCamera(camera, resolvePerspectiveCamera({ kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 45, near: 1, far: 200 }), 2)
    expect(camera.position.toArray()).toEqual([0, 0, 10])
    expect([camera.fov, camera.near, camera.far, camera.aspect]).toEqual([45, 1, 200, 2])
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    expect(forward.x).toBeCloseTo(0)
    expect(forward.y).toBeCloseTo(0)
    expect(forward.z).toBeCloseTo(-1)
  })
})

describe('perspectiveCameraIssues (CA-13)', () => {
  const fields = (camera: unknown): string[] => perspectiveCameraIssues(camera).map((issue) => issue.field)

  it('accepts a complete valid block and an empty one', () => {
    expect(fields({ kind: 'perspective' })).toEqual([])
    expect(fields({ kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60, near: 0.1, far: 100 })).toEqual([])
  })

  it.each([0, -10, 180, 200, Number.NaN, '60'])('rejects fov %s', (fov) => {
    expect(fields({ kind: 'perspective', fov })).toEqual(['camera.fov'])
  })

  it.each([0, -1])('rejects near %s', (near) => {
    expect(fields({ kind: 'perspective', near })).toEqual(['camera.near'])
  })

  it('rejects far that is not above near, against the declared or default near', () => {
    expect(fields({ kind: 'perspective', near: 5, far: 5 })).toEqual(['camera.far'])
    expect(fields({ kind: 'perspective', far: 0.05 })).toEqual(['camera.far'])
  })

  it.each([[[1, 2]], [[1, 2, 3, 4]], [[1, 2, Number.POSITIVE_INFINITY]], ['x'], [[1, '2', 3]]])('rejects position %j', (position) => {
    expect(fields({ kind: 'perspective', position })).toEqual(['camera.position'])
    expect(fields({ kind: 'perspective', target: position })).toEqual(['camera.target'])
  })

  it('reports nothing for a block that is not perspective', () => {
    expect(fields({ zoom: 12 })).toEqual([])
    expect(fields(undefined)).toEqual([])
  })
})
