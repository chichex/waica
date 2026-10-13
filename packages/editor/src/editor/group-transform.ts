// What a gizmo drag does to the entities under it (issue #173 CA-19, CA-21):
// the gizmo moves a pivot (the entity's own pose, or the center of a group's
// positions); every entity follows the pivot's change. Translation moves them
// all by its delta; rotation turns their offsets from the pivot and adds to
// their rotations; scale stretches their offsets and their scales. The result
// is scene JSON: positions and scales, rotations in Euler degrees XYZ, all
// rounded to 0.001 (inference 20).
import { THREE, type TransformJson } from '@waica/engine'

export interface Pose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

const STEP = 1000

/** A value rounded to 0.001, with -0 read as 0. */
const rounded = (value: number): number => Math.round(value * STEP) / STEP + 0

const triple = (x: number, y: number, z: number): [number, number, number] => [rounded(x), rounded(y), rounded(z)]

/** An entity the gizmo drags: its pose at the start, and its rotation as stored (the Euler angles a result stays near). */
export interface DraggedEntity {
  name: string
  start: Pose
  rotation: THREE.Euler
}

const TURN = Math.PI * 2

/**
 * The Euler angles (XYZ) of `quaternion` nearest to `reference`: of its two
 * decompositions, (x, y, z) and (x + π, π − y, z + π), each angle taken at the
 * turn closest to the reference's, so a yaw past 90° reads 100°, not -180, 80, -180.
 */
function nearestEuler(quaternion: THREE.Quaternion, reference: THREE.Euler): THREE.Euler {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
  const near = (angle: number, to: number): number => angle + TURN * Math.round((to - angle) / TURN)
  const candidates = [
    [euler.x, euler.y, euler.z],
    [euler.x + Math.PI, Math.PI - euler.y, euler.z + Math.PI],
  ].map(([x = 0, y = 0, z = 0]) => new THREE.Euler(near(x, reference.x), near(y, reference.y), near(z, reference.z), 'XYZ'))
  const distance = (candidate: THREE.Euler): number =>
    Math.abs(candidate.x - reference.x) + Math.abs(candidate.y - reference.y) + Math.abs(candidate.z - reference.z)
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best))
}

/** A pose as scene JSON, its rotation nearest to `reference`. */
function transformOf({ position, quaternion, scale }: Pose, reference: THREE.Euler): TransformJson {
  const euler = nearestEuler(quaternion, reference)
  const degrees = (radians: number): number => THREE.MathUtils.radToDeg(radians)
  return {
    position: triple(position.x, position.y, position.z),
    rotation: triple(degrees(euler.x), degrees(euler.y), degrees(euler.z)),
    scale: triple(scale.x, scale.y, scale.z),
  }
}

/** Each entity's transform once the pivot went from `pivotStart` to `pivotNow`. */
export function draggedTransforms(
  entities: readonly DraggedEntity[],
  pivotStart: Pose,
  pivotNow: Pose,
): Array<{ name: string; transform: TransformJson }> {
  const turn = pivotNow.quaternion.clone().multiply(pivotStart.quaternion.clone().invert())
  const stretch = pivotNow.scale.clone().divide(pivotStart.scale)
  return entities.map(({ name, start, rotation }) => {
    const offset = start.position.clone().sub(pivotStart.position).multiply(stretch).applyQuaternion(turn)
    const position = pivotNow.position.clone().add(offset)
    const quaternion = turn.clone().multiply(start.quaternion)
    const scale = start.scale.clone().multiply(stretch)
    return { name, transform: transformOf({ position, quaternion, scale }, rotation) }
  })
}
