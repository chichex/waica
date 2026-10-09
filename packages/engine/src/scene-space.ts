import { isFiniteNumber, perspectiveCameraIssues, shown, type SceneFieldIssue } from './scene-camera-3d.js'

/**
 * A scene's space (ADR 0027): `'2d'` is the engine's orthographic world,
 * where `z` is draw order; `'3d'` makes `z` a world axis under a perspective
 * camera and a real depth buffer. A scene declares it as `render.space`.
 */
export type SceneSpace = '2d' | '3d'

export const SCENE_SPACES: readonly SceneSpace[] = ['2d', '3d']

/** The scene's space: 3d only when `render.space` says exactly so. */
export function resolveSceneSpace(render: unknown): SceneSpace {
  return recordOf(render).space === '3d' ? '3d' : '2d'
}

/**
 * What a scene's render block makes of the draw-order options at runtime. A
 * 3D scene has no y-sort and no isometric projection whatever the block
 * says (`validate_project` reports them); a 2D scene reads them as always.
 */
export function resolveRenderPolicy(render: unknown): {
  space: SceneSpace
  sort: 'y' | null
  projection: 'isometric' | null
} {
  const block = recordOf(render)
  const space = resolveSceneSpace(block)
  const flat = space === '2d'
  return {
    space,
    sort: flat && block.sort === 'y' ? 'y' : null,
    projection: flat && block.projection === 'isometric' ? 'isometric' : null,
  }
}

/** The engine's 2D components: they draw, collide or light the orthographic world. */
export const TWO_D_COMPONENTS = [
  'Sprite',
  'AnimatedSprite',
  'Tilemap',
  'Solid',
  'DynamicBody',
  'Hitbox',
  'Light',
  'ParticleEmitter',
] as const

/** The engine's 3D components. */
export const THREE_D_COMPONENTS = ['Model', 'Sun', 'PointLight'] as const

const TWO_D = new Set<string>(TWO_D_COMPONENTS)
const THREE_D = new Set<string>(THREE_D_COMPONENTS)

/**
 * True when a component of this type does not belong in a scene of this
 * space: a 2D component in 3d, a 3D one in 2d. `StateMachine` and
 * project-owned components belong in both.
 */
export function componentSpaceMismatch(space: SceneSpace, type: string): boolean {
  return space === '3d' ? TWO_D.has(type) : THREE_D.has(type)
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {}
}

/** Fields of `render` that only mean something in a 2D scene. */
const TWO_D_RENDER_FIELDS = ['sort', 'projection', 'batch'] as const

function cameraKindIssue(space: SceneSpace, camera: unknown, issues: SceneFieldIssue[]): void {
  if (camera === undefined || camera === null) return
  const kind = recordOf(camera).kind
  if (kind !== undefined && kind !== 'orthographic' && kind !== 'perspective') {
    issues.push({ field: 'camera.kind', message: `camera.kind must be 'orthographic' or 'perspective'; got ${shown(kind)}.` })
    return
  }
  if (space === '2d' && kind === 'perspective') {
    issues.push({ field: 'camera.kind', message: `A perspective camera needs render.space '3d'; this scene is 2d.` })
  }
  if (space === '3d' && kind !== 'perspective') {
    issues.push({ field: 'camera.kind', message: `A 3d scene needs a perspective camera (kind: 'perspective'); got an orthographic one.` })
  }
}

/**
 * Every invalid field of a scene's `render.space`, its camera block and the
 * render options a 3d scene cannot use: a space outside `'2d' | '3d'`, a
 * camera that does not match the space, a perspective camera out of range
 * and `render.sort`, `render.projection` or `render.batch` under 3d. Other
 * render fields are `sceneRenderIssues`'s.
 */
export function sceneSpaceIssues(render: unknown, camera: unknown): SceneFieldIssue[] {
  const block = recordOf(render)
  const issues: SceneFieldIssue[] = []
  if (block.space !== undefined && block.space !== '2d' && block.space !== '3d') {
    issues.push({ field: 'render.space', message: `render.space must be '2d' or '3d'; got ${shown(block.space)}.` })
  }
  const space = resolveSceneSpace(block)
  cameraKindIssue(space, camera, issues)
  issues.push(...perspectiveCameraIssues(camera))
  if (space === '3d') {
    for (const field of TWO_D_RENDER_FIELDS) {
      if (block[field] === undefined) continue
      issues.push({ field: `render.${field}`, message: `render.${field} is a 2D option and has no meaning in a 3d scene.` })
    }
  }
  return issues
}

/** The shape one transform field must have: its name and the lengths of tuple it accepts. */
interface TupleField {
  field: string
  lengths: readonly number[]
}

function tupleIssue(issues: SceneFieldIssue[], { field, lengths }: TupleField, value: unknown): void {
  if (value === undefined) return
  if (Array.isArray(value) && lengths.includes(value.length) && value.every(isFiniteNumber)) return
  const need = lengths.join(' or ')
  issues.push({ field, message: `${field} must be ${need} finite numbers; got ${JSON.stringify(value)}.` })
}

/**
 * An entity's `position` (2 or 3 finite numbers), `rotation` (degrees) and
 * `scale` (3 finite numbers each) that are anything else.
 */
export function entityTransformIssues(entity: unknown): SceneFieldIssue[] {
  const json = recordOf(entity)
  const issues: SceneFieldIssue[] = []
  tupleIssue(issues, { field: 'position', lengths: [2, 3] }, json.position)
  tupleIssue(issues, { field: 'rotation', lengths: [3] }, json.rotation)
  tupleIssue(issues, { field: 'scale', lengths: [3] }, json.scale)
  return issues
}
