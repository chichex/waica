import { expect, it } from 'vitest'
import { perspectiveCameraIssues, resolvePerspectiveCamera } from './scene-camera-3d'

// Issue #181 CA-5: the perspective camera block's orbit fields.

it('fills every orbit field with its default once the block follows an entity (CA-5)', () => {
  const resolved = resolvePerspectiveCamera({ kind: 'perspective', follow: 'Player' })

  expect(resolved.orbit).toEqual({
    follow: 'Player',
    distance: 6,
    minDistance: 2,
    maxDistance: 12,
    yaw: 0,
    pitch: 20,
    minPitch: -10,
    maxPitch: 70,
    lookHeight: 1.2,
    sensitivity: 0.2,
    orbitSpeed: 120,
    invertY: false,
    orbitLeftAction: 'look_left',
    orbitRightAction: 'look_right',
    orbitUpAction: 'look_up',
    orbitDownAction: 'look_down',
  })
})

it('keeps the declared orbit fields over the defaults (CA-5)', () => {
  const resolved = resolvePerspectiveCamera({
    kind: 'perspective',
    follow: 'Hero',
    distance: 4,
    yaw: 90,
    invertY: true,
    orbitLeftAction: 'turn_left',
  })

  expect(resolved.orbit).toMatchObject({ follow: 'Hero', distance: 4, yaw: 90, invertY: true, orbitLeftAction: 'turn_left' })
  expect(resolved.orbit?.maxDistance).toBe(12)
})

it('has no orbit without follow, and keeps today’s fixed camera fields (CA-5)', () => {
  const fixed = resolvePerspectiveCamera({ kind: 'perspective', position: [1, 2, 3], target: [0, 1, 0], distance: 9 })

  expect(fixed.orbit).toBeUndefined()
  expect(fixed).toMatchObject({ position: [1, 2, 3], target: [0, 1, 0], fov: 60 })
  expect(resolvePerspectiveCamera({ kind: 'perspective', follow: '' }).orbit).toBeUndefined()
})

it('accepts follow on a perspective block but still rejects the other orthographic fields (CA-5)', () => {
  const issues = perspectiveCameraIssues({ kind: 'perspective', follow: 'Player', zoom: 9, smoothing: 0.5 })

  expect(issues.map((issue) => issue.field)).toEqual(['camera.zoom', 'camera.smoothing'])
})

it('reports inverted distance and pitch ranges and a pitch outside (-89, 89) (CA-5)', () => {
  const issues = perspectiveCameraIssues({
    kind: 'perspective',
    follow: 'Player',
    minDistance: 8,
    maxDistance: 3,
    minPitch: 40,
    maxPitch: 10,
    pitch: 95,
  })

  expect(issues.map((issue) => issue.field)).toEqual(['camera.pitch', 'camera.minDistance', 'camera.minPitch'])
  expect(issues[1]?.message).toContain('camera.minDistance (8) must not exceed camera.maxDistance (3)')
  expect(perspectiveCameraIssues({ kind: 'perspective', minPitch: -89 }).map((issue) => issue.field)).toEqual(['camera.minPitch'])
  expect(perspectiveCameraIssues({ kind: 'perspective', maxPitch: 88.9, minPitch: -88.9 })).toEqual([])
})

it('reports orbit fields of the wrong type (CA-5)', () => {
  const issues = perspectiveCameraIssues({
    kind: 'perspective',
    follow: 3,
    distance: 0,
    sensitivity: -1,
    invertY: 'yes',
    orbitUpAction: '',
  })

  expect(issues.map((issue) => issue.field)).toEqual([
    'camera.follow',
    'camera.distance',
    'camera.sensitivity',
    'camera.invertY',
    'camera.orbitUpAction',
  ])
})
