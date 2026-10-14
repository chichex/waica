import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { THIRD_PERSON_PREFABS } from './prefabs'
import { THIRD_PERSON_SCENE } from './scene-default'

// The demo's checkpoints hang KayKit's wall banner on the courtyard walls:
// a single-sided cloth built to face +z from a wall, which free-standing
// floats and vanishes from behind. Where the Player stands — its start and
// each checkpoint's sensor and spawn — stays on open floor, out of every
// skeleton's sight.

type Xz = [number, number]
/** An axis-aligned box on xz. */
interface Rect {
  min: Xz
  max: Xz
}

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

const { entities } = THIRD_PERSON_SCENE
const byPrefab = (prefab: string): SceneEntityJson[] => entities.filter((entity) => entity.prefab === prefab)
const checkpoints = byPrefab('objects/checkpoint')
const walls = byPrefab('tiles/wall')
const player = entities.find((entity) => entity.name === 'Player') ?? { name: 'missing Player' }

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

type Triple = [number, number, number]
/** An authored [x, y, z], or `fallback` when it is absent. */
const triple = (value: unknown, fallback: Triple): Triple => {
  const [x = fallback[0], y = fallback[1], z = fallback[2]] = vector(value, fallback)
  return [x, y, z]
}

/** The Knight's capsule radius, from its prefab's Collider. */
const PLAYER_RADIUS = Number(propsOf(player, 'Collider').radius)

/** A wall piece's inner face: the plane its collider's yard side lies on, its facing and its half width along the face. */
function innerFaceOf(wall: SceneEntityJson): { point: Xz; facing: Xz; halfWidth: number } {
  const [width = 0, , depth = 0] = vector(propsOf(wall, 'Collider').size, [1, 1, 1])
  const facing = facingOf(wall)
  const [x, z] = xzOf(wall)
  return { point: [x + (facing[0] * depth) / 2, z + (facing[1] * depth) / 2], facing, halfWidth: width / 2 }
}

/** The world xz box of an entity's box Collider — scaled, turned by its yaw and moved — and its height range. */
function colliderBoxOf(entity: SceneEntityJson): Rect & { bottom: number } {
  const collider = propsOf(entity, 'Collider')
  const [kx, ky, kz] = triple(entity.scale, [1, 1, 1])
  const [sx, sy, sz] = triple(collider.size, [1, 1, 1])
  const [ox, oy, oz] = triple(collider.offset, [0, 0, 0])
  const [cx, cz] = turned(entity, [ox * kx, oz * kz])
  const [px, pz] = xzOf(entity)
  const corners = [turned(entity, [(sx * kx) / 2, (sz * kz) / 2]), turned(entity, [(-sx * kx) / 2, (sz * kz) / 2])]
  const hx = Math.max(...corners.map(([x]) => Math.abs(x)))
  const hz = Math.max(...corners.map(([, z]) => Math.abs(z)))
  return { min: [px + cx - hx, pz + cz - hz], max: [px + cx + hx, pz + cz + hz], bottom: (entity.position?.[1] ?? 0) + (oy - sy / 2) * ky }
}

/** Where the Player comes back after touching a checkpoint: its position plus its turned Checkpoint.spawnOffset. */
function spawnOf(checkpoint: SceneEntityJson): [number, number, number] {
  const [ox = 0, oy = 0, oz = 0] = vector(propsOf(checkpoint, 'Checkpoint').spawnOffset, [0, 0, 0])
  const [x = 0, y = 0, z = 0] = checkpoint.position ?? []
  const [dx, dz] = turned(checkpoint, [ox, oz])
  return [x + dx, y + oy, z + dz]
}

/** The level's solid pieces the Knight cannot stand in: every fixed tile but the floor it walks on. */
const solids = entities.filter((entity) => {
  const prefab = THIRD_PERSON_PREFABS[entity.prefab ?? '']
  return prefab?.type === 'tile' && entity.prefab !== 'tiles/floor' && propsOf(entity, 'Collider').sensor !== true
})

/** How far a point is from a box on xz (0 inside it). */
const pointToRect = ([px, pz]: Xz, { min, max }: Rect): number =>
  Math.hypot(Math.max(min[0] - px, 0, px - max[0]), Math.max(min[1] - pz, 0, pz - max[1]))

/** Whether two boxes share area on xz (touching faces do not). */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.min[0] < b.max[0] - 1e-6 && b.min[0] < a.max[0] - 1e-6 && a.min[1] < b.max[1] - 1e-6 && b.min[1] < a.max[1] - 1e-6

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

it('keeps each checkpoint sensor and spawn on open floor in front of its banner, clear of every solid piece', () => {
  expect(PLAYER_RADIUS).toBeGreaterThan(0)
  expect(solids.map((solid) => solid.prefab)).toEqual(expect.arrayContaining(['tiles/wall', 'tiles/column', 'tiles/step', 'tiles/torch']))
  for (const checkpoint of checkpoints) {
    const sensor = colliderBoxOf(checkpoint)
    for (const axis of [0, 1] as const) {
      expect(sensor.min[axis], checkpoint.name).toBeGreaterThanOrEqual(-yardHalf - 1e-6)
      expect(sensor.max[axis], checkpoint.name).toBeLessThanOrEqual(yardHalf + 1e-6)
    }
    expect(sensor.bottom, checkpoint.name).toBeCloseTo(0, 6)

    const [x, y, z] = spawnOf(checkpoint)
    expect(y, `${checkpoint.name} spawns on the floor`).toBe(0)
    expect(pointToRect([x, z], sensor), `${checkpoint.name} spawns inside its sensor`).toBe(0)
    for (const solid of solids) {
      expect(overlaps(sensor, colliderBoxOf(solid)), `${checkpoint.name}'s sensor and ${solid.name}`).toBe(false)
      // The Knight's capsule clears every solid where it comes back.
      expect(pointToRect([x, z], colliderBoxOf(solid)), `${checkpoint.name}'s spawn and ${solid.name}`).toBeGreaterThanOrEqual(PLAYER_RADIUS)
    }
  }
})

/** A skeleton's patrol rail on xz (its Patrol, prefab props under the entity's overrides) and its Chaser.range. */
function railOf(skeleton: SceneEntityJson): { from: Xz; to: Xz; range: number } {
  const patrol = propsOf(skeleton, 'Patrol')
  const [x, z] = xzOf(skeleton)
  const reach = Number(patrol.distance ?? 3)
  const vertical = patrol.axis === 'vertical'
  return {
    from: vertical ? [x, z - reach] : [x - reach, z],
    to: vertical ? [x, z + reach] : [x + reach, z],
    range: Number(propsOf(skeleton, 'Chaser').range ?? 0),
  }
}

/** The nearest a point gets to a segment on xz. */
function pointToRail([px, pz]: Xz, { from: [ax, az], to: [bx, bz] }: { from: Xz; to: Xz }): number {
  const length = (bx - ax) ** 2 + (bz - az) ** 2
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / length))
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)))
}

/** The nearest a rail gets to a box on xz, when they do not cross: at a rail end or at a box corner. */
function rectToRail(rect: Rect, rail: { from: Xz; to: Xz }): number {
  const corners: Xz[] = [rect.min, rect.max, [rect.min[0], rect.max[1]], [rect.max[0], rect.min[1]]]
  return Math.min(pointToRect(rail.from, rect), pointToRect(rail.to, rect), ...corners.map((corner) => pointToRail(corner, rail)))
}

it('starts calm: no skeleton patrols within Chaser.range of the start, of a checkpoint spawn or of its sensor (CA-26)', () => {
  const places: Array<{ name: string; rect: Rect }> = [
    { name: 'the Player start', rect: { min: xzOf(player), max: xzOf(player) } },
    ...checkpoints.flatMap((checkpoint) => {
      const [x, , z] = spawnOf(checkpoint)
      return [
        { name: `${checkpoint.name}'s spawn`, rect: { min: [x, z], max: [x, z] } satisfies Rect },
        { name: `${checkpoint.name}'s sensor`, rect: colliderBoxOf(checkpoint) },
      ]
    }),
  ]
  const skeletons = byPrefab('characters/skeleton')
  expect(skeletons).toHaveLength(3)
  for (const skeleton of skeletons) {
    const rail = railOf(skeleton)
    expect(rail.range, skeleton.name).toBeGreaterThan(0)
    for (const place of places) expect(rectToRail(place.rect, rail), `${skeleton.name} to ${place.name}`).toBeGreaterThan(rail.range)
  }
})
