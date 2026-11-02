import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, it } from 'vitest'

// Issue #204 CA-15 / CA-6: the pixel fixture's geometry, checked in native Node
// without a browser. The e2e measures pixels; this proves the fixture asks the
// right question (which point is in range, in the cone, in the caster's shadow).

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

type Vec3 = [number, number, number]
type Props = Record<string, unknown>
interface Entity {
  name: string
  position: Vec3
  components: { type: string; props?: Props }[]
}
interface Fixture {
  entities: Entity[]
  points: Record<string, Vec3>
  /** Every kind's sample points, as the cases read them. */
  pointsByKind: Record<string, Record<string, Vec3>>
  lightTypes: Record<string, string>
}

function unexpected(what: string, value: unknown): never {
  throw new Error(`unexpected ${what} in the probe's output: ${JSON.stringify(value)}`)
}

function isFixture(value: unknown): value is Fixture {
  return typeof value === 'object' && value !== null && 'entities' in value && 'points' in value && 'pointsByKind' in value
}

let fixture: Fixture

beforeAll(() => {
  const script = `
    import { LIGHT_TYPES, POINTS, shadowScene, SPOT_POINTS } from './scripts/runtime-e2e-shadows-fixtures.mjs';
    const scene = shadowScene('spot');
    console.log(JSON.stringify({ entities: scene.entities, points: SPOT_POINTS, pointsByKind: POINTS, lightTypes: LIGHT_TYPES }));
  `
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  }))
  fixture = isFixture(output) ? output : unexpected('fixture', output)
})

const entity = (name: string): Entity => fixture.entities.find((candidate) => candidate.name === name) ?? unexpected('entity', name)
const propsOf = (name: string, type: string): Props =>
  entity(name).components.find((component) => component.type === type)?.props ?? unexpected('component', `${name}/${type}`)

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vec3): number => Math.hypot(...a)

function light(): { at: Vec3; axis: Vec3; props: Props } {
  const { position, components } = entity('Light')
  const props = components.find((component) => component.type === 'SpotLight')?.props ?? unexpected('SpotLight', components)
  const direction = props.direction as Vec3
  const size = length(direction)
  return { at: position, axis: [direction[0] / size, direction[1] / size, direction[2] / size], props }
}

/** Depth along the cone's axis: the limit of the shadow range (spec I-3), not the euclidean distance. */
function depthOf(point: Vec3): number {
  const { at, axis } = light()
  return dot(sub(point, at), axis)
}

/** Angle in degrees between the cone's axis and the way to `point`. */
function angleTo(point: Vec3): number {
  const { at, axis } = light()
  const way = sub(point, at)
  return (Math.acos(dot(way, axis) / length(way)) * 180) / Math.PI
}

const AXES = [0, 1, 2] as const

/** The parameters, along a segment starting at the light, where it is inside one axis's slab: [-Inf, Inf] if always, [Inf, -Inf] if never. */
function slab(from: number, to: number, step: number): [number, number] {
  if (step === 0) return from <= 0 && to >= 0 ? [-Infinity, Infinity] : [Infinity, -Infinity]
  const [near, far] = [from / step, to / step].sort((a, b) => a - b)
  return [near ?? Infinity, far ?? -Infinity]
}

/** Whether the segment from the light to `point` crosses the Caster's box: the point is in its geometric shadow. */
function inCastersGeometricShadow(point: Vec3): boolean {
  const { at } = light()
  const half = Number(propsOf('Caster', 'Model').size) / 2
  const centre = sub(entity('Caster').position, at)
  const way = sub(point, at)
  const slabs = AXES.map((axis) => slab(centre[axis] - half, centre[axis] + half, way[axis]))
  return Math.max(0, ...slabs.map(([near]) => near)) <= Math.min(1, ...slabs.map(([, far]) => far))
}

it('isolates one SpotLight with the CA-6 range: distance 9 and shadow range 2', () => {
  const lights = fixture.entities.flatMap((candidate) => candidate.components.filter((component) => ['Sun', 'PointLight', 'SpotLight'].includes(component.type)))
  expect(lights.map((component) => component.type)).toEqual(['SpotLight'])
  expect(light().props).toMatchObject({ castShadows: true, distance: 9, shadowMaxDistance: 2, direction: [0, -1, 0] })
  expect(fixture.pointsByKind.spot).toEqual(fixture.points)
  expect(fixture.lightTypes.spot).toBe('SpotLight')
})

it('puts the shadow receiver 1.5 along the axis, inside the cone, under a caster that is inside the range', () => {
  const { props } = light()
  const range = Number(props.shadowMaxDistance)
  const cone = Number(props.angle)
  const point = (name: string): Vec3 => fixture.points[name] ?? unexpected('point', name)

  expect(depthOf(point('shadow'))).toBeCloseTo(1.5, 9)
  expect(depthOf(point('shadow'))).toBeLessThan(range)
  expect(depthOf(point('control'))).toBeCloseTo(1.5, 9)
  // The caster hangs inside the cone and the range, and its shadow lands on the shadow point only.
  expect(angleTo(entity('Caster').position)).toBeLessThan(cone)
  expect(depthOf(entity('Caster').position)).toBeLessThan(range)
  expect(inCastersGeometricShadow(point('shadow'))).toBe(true)
  // The control is lit inside the cone's full-strength part (the penumbra fades the outer 20%).
  expect(inCastersGeometricShadow(point('control'))).toBe(false)
  expect(angleTo(point('control'))).toBeLessThan(cone * (1 - Number(props.penumbra ?? 0.2)))
})

it('puts a lit point 5 along the axis, beyond the range and under the caster; and a point outside the cone', () => {
  const { props } = light()
  const range = Number(props.shadowMaxDistance)
  const reach = Number(props.distance)
  const cone = Number(props.angle)
  const beyond = fixture.points.beyond ?? unexpected('point', 'beyond')
  const outside = fixture.points.outside ?? unexpected('point', 'outside')

  // 5 along the axis: past the shadow range (2), inside the illumination (distance 9), and in the caster's geometric shadow.
  expect(depthOf(beyond)).toBeCloseTo(5, 9)
  expect(depthOf(beyond)).toBeGreaterThan(range)
  expect(length(sub(beyond, light().at))).toBeLessThan(reach)
  expect(inCastersGeometricShadow(beyond)).toBe(true)
  expect(angleTo(beyond)).toBeLessThan(cone * (1 - Number(props.penumbra ?? 0.2)))
  // Past the cone, with a margin the penumbra cannot reach.
  expect(angleTo(outside)).toBeGreaterThan(cone + 5)
  expect(depthOf(outside)).toBeCloseTo(5, 9)
})

it('keeps every receiver opaque and non-casting, and every sample point on its own surface', () => {
  const plate = entity('Plate')
  const ground = entity('Ground')
  expect(plate.position[1]).toBeCloseTo(light().at[1] - 1.5, 9)
  expect(ground.position[1]).toBeCloseTo(light().at[1] - 5, 9)
  for (const receiver of [plate, ground]) expect(propsOf(receiver.name, 'Model')).toMatchObject({ shape: 'plane', castShadows: false })
  const heights = Object.fromEntries(Object.entries(fixture.points).map(([name, point]) => [name, point[1]]))
  expect(heights).toEqual({ shadow: plate.position[1], control: plate.position[1], beyond: ground.position[1], outside: ground.position[1] })
  // Both plane sizes cover the points they hold (planes are square and centred on their entity).
  const half = (name: string): number => Number(propsOf(name, 'Model').size) / 2
  for (const name of ['shadow', 'control']) expect(Math.max(...(fixture.points[name] ?? [Infinity]).filter((_, axis) => axis !== 1).map(Math.abs))).toBeLessThan(half('Plate'))
  for (const name of ['beyond', 'outside']) expect(Math.max(...(fixture.points[name] ?? [Infinity]).filter((_, axis) => axis !== 1).map(Math.abs))).toBeLessThan(half('Ground'))
})
