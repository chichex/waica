import { describe, expect, it } from 'vitest'
import { THREE } from '@waica/engine'
import { draggedTransforms, type DraggedEntity, type Pose } from './group-transform'

/** Euler angles (XYZ) from degrees. */
const eulerOf = ([x, y, z]: [number, number, number]): THREE.Euler =>
  new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ')

const pose = (position: [number, number, number], rotationDeg: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): Pose => ({
  position: new THREE.Vector3(...position),
  quaternion: new THREE.Quaternion().setFromEuler(eulerOf(rotationDeg)),
  scale: new THREE.Vector3(...scale),
})

/** An entity at `start`, its stored rotation the given degrees. */
const entity = (name: string, start: Pose, rotationDeg: [number, number, number]): DraggedEntity => ({
  name,
  start,
  rotation: eulerOf(rotationDeg),
})

/** Two entities 4 units apart on x, around the center (1, 0, 0). */
const GROUP = [entity('Left', pose([-1, 0, 0], [0, 10, 0], [1, 1, 1]), [0, 10, 0]), entity('Right', pose([3, 0, 0], [0, 0, 0], [2, 1, 1]), [0, 0, 0])]
const CENTER = pose([1, 0, 0])

describe('a single entity under the gizmo (issue #173 CA-19)', () => {
  it('takes the pivot pose, rounded to 0.001, rotation in Euler degrees XYZ', () => {
    const start = pose([1, 2, 3], [0, 30, 0], [1, 1, 1])
    const now = pose([1.23456, 2, 3.0004], [0, 75.12345, 0], [1, 1.5, 1])

    const [moved] = draggedTransforms([entity('Knight', start, [0, 30, 0])], start, now)

    expect(moved).toEqual({ name: 'Knight', transform: { position: [1.235, 2, 3], rotation: [0, 75.123, 0], scale: [1, 1.5, 1] } })
  })
})

describe('a group under the gizmo (issue #173 CA-21)', () => {
  it('moves every entity by the same delta', () => {
    const moved = draggedTransforms(GROUP, CENTER, pose([1, 2, -0.5]))
    expect(moved.map((entry) => entry.transform.position)).toEqual([[-1, 2, -0.5], [3, 2, -0.5]])
    expect(moved.map((entry) => entry.transform.rotation)).toEqual([[0, 10, 0], [0, 0, 0]])
  })

  it('turns their positions around the center and adds the rotation to each', () => {
    const moved = draggedTransforms(GROUP, CENTER, pose([1, 0, 0], [0, 90, 0]))
    // 90° about +y takes +x to -z: Left (2 units toward -x) lands 2 units toward +z.
    expect(moved.map((entry) => entry.transform.position)).toEqual([[1, 0, 2], [1, 0, -2]])
    expect(moved.map((entry) => entry.transform.rotation)).toEqual([[0, 100, 0], [0, 90, 0]])
  })

  it('scales their offsets from the center and their scales', () => {
    const moved = draggedTransforms(GROUP, CENTER, pose([1, 0, 0], [0, 0, 0], [2, 1, 3]))
    expect(moved.map((entry) => entry.transform.position)).toEqual([[-3, 0, 0], [5, 0, 0]])
    expect(moved.map((entry) => entry.transform.scale)).toEqual([[2, 1, 3], [4, 1, 3]])
  })
})

describe('rotations past 90° (issue #173 CA-19)', () => {
  it('reads them as the angle the drag reached, not an equivalent flip', () => {
    const start = pose([0, 0, 0], [0, 80, 0])
    const [past] = draggedTransforms([entity('Knight', start, [0, 80, 0])], start, pose([0, 0, 0], [0, 100, 0]))
    expect(past?.transform.rotation).toEqual([0, 100, 0])
    const turned = pose([0, 0, 0], [0, 170, 0])
    const [around] = draggedTransforms([entity('Knight', turned, [0, 170, 0])], turned, pose([0, 0, 0], [0, 190, 0]))
    expect(around?.transform.rotation).toEqual([0, 190, 0])
  })
})

describe('an entity with a scale of 0 on an axis (issue #173 CA-19)', () => {
  it('stays finite when dragged: the flat axis is not stretched', () => {
    const flat = pose([0, 1, 0], [0, 0, 0], [1, 0, 1])
    const [moved] = draggedTransforms([entity('Flat', flat, [0, 0, 0])], flat, pose([2, 1, 0], [0, 0, 0], [1, 0, 1]))
    expect(moved?.transform).toEqual({ position: [2, 1, 0], rotation: [0, 0, 0], scale: [1, 0, 1] })
  })
})
