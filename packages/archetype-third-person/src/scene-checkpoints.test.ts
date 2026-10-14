import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { THIRD_PERSON_PREFABS } from './prefabs'
import { THIRD_PERSON_SCENE } from './scene-default'

// The demo's checkpoints hang KayKit's wall banner on the courtyard walls:
// a single-sided cloth built to face +z from a wall, which free-standing
// floats and vanishes from behind.

type Xz = [number, number]

/** A glb's POSITION bounds over all its primitives, read from the asset itself. */
function glbBounds(file: string): { min: number[]; max: number[] } {
  const bytes = readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)))
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[]
    accessors: { min: number[]; max: number[] }[]
  }
  const accessors = json.meshes.flatMap((mesh) => mesh.primitives.map((primitive) => json.accessors[primitive.attributes.POSITION]))
  const min = [0, 1, 2].map((axis) => Math.min(...accessors.map((accessor) => accessor?.min[axis] ?? Infinity)))
  const max = [0, 1, 2].map((axis) => Math.max(...accessors.map((accessor) => accessor?.max[axis] ?? -Infinity)))
  return { min, max }
}

const BANNER = glbBounds('dungeon-banner.glb')
/** How far the Knight's capsule reaches from its centre (prefab characters/player). */
const PLAYER_RADIUS = 0.5

const { entities } = THIRD_PERSON_SCENE
const checkpoints = entities.filter((entity) => entity.prefab === 'objects/checkpoint')
const walls = entities.filter((entity) => entity.prefab === 'tiles/wall')

/** Where an entity's local +z points on xz, turned by its yaw in degrees. */
function facingOf(entity: SceneEntityJson): Xz {
  const yaw = ((entity.rotation?.[1] ?? 0) * Math.PI) / 180
  return [Math.sin(yaw), Math.cos(yaw)]
}

/** A local xz offset turned into the world by the entity's yaw. */
function turned(entity: SceneEntityJson, [x, z]: Xz): Xz {
  const [sin, cos] = facingOf(entity)
  return [x * cos + z * sin, -x * sin + z * cos]
}

const xzOf = (entity: SceneEntityJson): Xz => [entity.position?.[0] ?? 0, entity.position?.[2] ?? 0]
const dot = ([ax, az]: Xz, [bx, bz]: Xz): number => ax * bx + az * bz
const sub = ([ax, az]: Xz, [bx, bz]: Xz): Xz => [ax - bx, az - bz]

function propsOf(entity: SceneEntityJson, type: string): Record<string, unknown> {
  const prefab = THIRD_PERSON_PREFABS[entity.prefab ?? '']
  return { ...(prefab?.components.find((component) => component.type === type)?.props ?? {}), ...(entity.overrides?.[type] ?? {}) }
}

const vector = (value: unknown, fallback: number[]): number[] => (Array.isArray(value) ? value.map(Number) : fallback)

/** A wall piece's inner face: the plane its collider's yard side lies on, its facing and its half width along the face. */
function innerFaceOf(wall: SceneEntityJson): { point: Xz; facing: Xz; halfWidth: number } {
  const [width = 0, , depth = 0] = vector(propsOf(wall, 'Collider').size, [1, 1, 1])
  const facing = facingOf(wall)
  const [x, z] = xzOf(wall)
  return { point: [x + (facing[0] * depth) / 2, z + (facing[1] * depth) / 2], facing, halfWidth: width / 2 }
}

/** The world xz box of a checkpoint's sensor, and its height range. */
function sensorOf(checkpoint: SceneEntityJson): { min: Xz; max: Xz; bottom: number } {
  const collider = propsOf(checkpoint, 'Collider')
  const [sx = 0, sy = 0, sz = 0] = vector(collider.size, [1, 1, 1])
  const [ox = 0, oy = 0, oz = 0] = vector(collider.offset, [0, 0, 0])
  const [cx, cz] = turned(checkpoint, [ox, oz])
  const [px, pz] = xzOf(checkpoint)
  const corners = [turned(checkpoint, [sx / 2, sz / 2]), turned(checkpoint, [-sx / 2, sz / 2])].map(([x, z]) => [Math.abs(x), Math.abs(z)])
  const half: Xz = [Math.max(...corners.map(([x = 0]) => x)), Math.max(...corners.map(([, z = 0]) => z))]
  return { min: [px + cx - half[0], pz + cz - half[1]], max: [px + cx + half[0], pz + cz + half[1]], bottom: (checkpoint.position?.[1] ?? 0) + oy - sy / 2 }
}

/** Where the Player comes back after touching a checkpoint: its position plus its turned Checkpoint.spawnOffset. */
function spawnOf(checkpoint: SceneEntityJson): [number, number, number] {
  const [ox = 0, oy = 0, oz = 0] = vector(propsOf(checkpoint, 'Checkpoint').spawnOffset, [0, 0, 0])
  const [x = 0, y = 0, z = 0] = checkpoint.position ?? []
  const [dx, dz] = turned(checkpoint, [ox, oz])
  return [x + dx, y + oy, z + dz]
}

/** The wall piece a checkpoint hangs on: same facing, the banner's width within the piece. */
function wallBehind(checkpoint: SceneEntityJson): ReturnType<typeof innerFaceOf> | undefined {
  const facing = facingOf(checkpoint)
  return walls.map(innerFaceOf).find((face) => {
    if (dot(face.facing, facing) < 0.999) return false
    const across = Math.abs(dot(sub(xzOf(checkpoint), face.point), [facing[1], -facing[0]]))
    return across + Math.max(-(BANNER.min[0] ?? 0), BANNER.max[0] ?? 0) <= face.halfWidth + 1e-6
  })
}

/** The walkable floor's half side: the walls' inner faces. */
const yardHalf = Math.min(...walls.map((wall) => Math.abs(dot(innerFaceOf(wall).point, innerFaceOf(wall).facing))))

it('reads the banner as a cloth hanging from a wall, facing +z (its geometry)', () => {
  expect(BANNER.min[2]).toBeGreaterThan(0.3)
  expect(BANNER.max[2]).toBeLessThan(0.8)
  expect(BANNER.max[1]).toBeGreaterThan(3)
})

it('hangs each checkpoint banner flat on a courtyard wall piece, facing into the yard', () => {
  expect(checkpoints).toHaveLength(2)
  for (const checkpoint of checkpoints) {
    const face = wallBehind(checkpoint)
    expect(face, `${checkpoint.name} must share a wall piece's facing and fit within it`).toBeDefined()
    if (!face) continue
    const facing = facingOf(checkpoint)
    // The cloth's back lies just in front of the wall's inner face: not inside it, not floating off it.
    const back = dot(sub(xzOf(checkpoint), face.point), facing) + (BANNER.min[2] ?? 0)
    expect(back, checkpoint.name).toBeGreaterThanOrEqual(0)
    expect(back, checkpoint.name).toBeLessThanOrEqual(0.05)
    expect(dot(facing, sub([0, 0], xzOf(checkpoint))), `${checkpoint.name} faces the yard`).toBeGreaterThan(0)
    expect(checkpoint.position?.[1], `${checkpoint.name} hangs from the floor up`).toBe(0)
  }
})

it('keeps each checkpoint sensor and spawn on the walkable floor in front of its banner', () => {
  for (const checkpoint of checkpoints) {
    const sensor = sensorOf(checkpoint)
    for (const axis of [0, 1] as const) {
      expect(sensor.min[axis], checkpoint.name).toBeGreaterThanOrEqual(-yardHalf - 1e-6)
      expect(sensor.max[axis], checkpoint.name).toBeLessThanOrEqual(yardHalf + 1e-6)
    }
    expect(sensor.bottom, checkpoint.name).toBeCloseTo(0, 6)

    const [x, y, z] = spawnOf(checkpoint)
    expect(y, `${checkpoint.name} spawns on the floor`).toBe(0)
    expect(x).toBeGreaterThan(sensor.min[0])
    expect(x).toBeLessThan(sensor.max[0])
    expect(z).toBeGreaterThan(sensor.min[1])
    expect(z).toBeLessThan(sensor.max[1])
    // The Knight's capsule clears every wall's inner face where it comes back.
    expect(Math.max(Math.abs(x), Math.abs(z)), checkpoint.name).toBeLessThanOrEqual(yardHalf - PLAYER_RADIUS)
  }
})
