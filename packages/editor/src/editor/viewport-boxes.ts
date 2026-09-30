// Pure geometry of the editor's component boxes: which live components carry
// a resizable box, where its outline and handles sit in render space, and how
// a dragged center maps back to component offsets. Shared by the per-frame
// selection gizmos and the pointer hit-tests, so both always agree.
import { componentBox, entityBounds as editorEntityBounds, type EditorBoxBounds, type EditorBoxLike, type EditorBoxRole } from './appearance-bounds'
import { resolveCollisionPoints, type CollisionPoint, type Component, type Entity, type SceneJson } from '@waica/engine'
import type { ViewportLive } from './viewport-live'
import { logicalPoint, renderPoint, renderVertices, type ViewportProjection } from './viewport-space'

export const projectionOf = (scene: SceneJson): ViewportProjection =>
  scene.render?.projection ?? null

/** The logical (scene) point behind a render-space world point. */
export const logicalAt = (live: ViewportLive, [wx, wy]: CollisionPoint): [number, number] =>
  logicalPoint(projectionOf(live.scene), wx, wy)

/**
 * The box role of a component type that owns an editor box (BOX_KINDS), or
 * null for every other type. Other components may carry `width`/`height` for
 * their own purposes: a ParticleEmitter's particle quad or a MeleeAttack's
 * strike width. Those sizes say nothing about where the entity is, so they
 * never shape its selection bounds. An entity with no box falls back to the
 * 0.6 marker.
 */
const roleForType = (type: string): EditorBoxRole | null =>
  BOX_KINDS.find((kind) => (kind.types as readonly string[]).includes(type))?.role ?? null

/** The box fields a live component exposes, read without asserting its type. */
function editorBoxOf(component: object): EditorBoxLike {
  const read = (key: keyof EditorBoxLike): unknown => Reflect.get(component, key)
  return {
    width: read('width'),
    height: read('height'),
    offsetX: read('offsetX'),
    offsetY: read('offsetY'),
    anchorX: read('anchorX'),
    anchorY: read('anchorY'),
    flipX: read('flipX'),
    frameScaleX: read('frameScaleX'),
    frameScaleY: read('frameScaleY'),
  }
}

/** The render-space box enclosing a logical collision box once its corners are projected. */
function projectedCollisionBox(bounds: EditorBoxBounds, projection: ViewportProjection): EditorBoxBounds {
  const corners = renderVertices(projection, [
    [bounds.centerX - bounds.width / 2, bounds.centerY - bounds.height / 2],
    [bounds.centerX + bounds.width / 2, bounds.centerY - bounds.height / 2],
    [bounds.centerX + bounds.width / 2, bounds.centerY + bounds.height / 2],
    [bounds.centerX - bounds.width / 2, bounds.centerY + bounds.height / 2],
  ])
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const bottom = Math.min(...ys)
  const top = Math.max(...ys)
  return {
    centerX: (left + right) / 2,
    centerY: (bottom + top) / 2,
    width: right - left,
    height: top - bottom,
  }
}

/** Render-space union used by both picking and selection gizmos. */
export function entityBounds(entity: Entity, projection: ViewportProjection): EditorBoxBounds {
  const components = entity.components.flatMap((component) => {
    const type = (component.constructor as { componentName?: string }).componentName ?? ''
    const role = roleForType(type)
    return role ? [{ role, box: editorBoxOf(component) }] : []
  })
  if (projection !== 'isometric') return editorEntityBounds(components)
  const boxes = components.flatMap(({ role, box }) => {
    const bounds = componentBox(box, role)
    if (!bounds) return []
    return [role === 'appearance' ? bounds : projectedCollisionBox(bounds, projection)]
  })
  if (boxes.length === 0) return editorEntityBounds([])
  const left = Math.min(...boxes.map((box) => box.centerX - box.width / 2))
  const right = Math.max(...boxes.map((box) => box.centerX + box.width / 2))
  const bottom = Math.min(...boxes.map((box) => box.centerY - box.height / 2))
  const top = Math.max(...boxes.map((box) => box.centerY + box.height / 2))
  return {
    centerX: (left + right) / 2,
    centerY: (bottom + top) / 2,
    width: right - left,
    height: top - bottom,
  }
}

export const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
]

/**
 * The resizable boxes drawn on the selected entity, in hit-test order:
 * collision first (its handles win a shared corner), then the appearance
 * quad in the selection amber.
 */
export const BOX_KINDS = [
  { types: ['Hitbox'], color: 0xef476f, role: 'collision' },
  { types: ['Solid'], color: 0x06d6a0, role: 'collision' },
  { types: ['DynamicBody'], color: 0x118ab2, role: 'collision' },
  { types: ['Sprite', 'AnimatedSprite'], color: 0xffb703, role: 'appearance' },
] as const

export type BoxRole = (typeof BOX_KINDS)[number]['role']

export interface LiveBox {
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  anchorX?: number
  anchorY?: number
  flipX?: boolean
  frameScaleX?: number
  frameScaleY?: number
  shape?: string
  points?: CollisionPoint[]
}

const isNumber = (value: unknown): boolean => typeof value === 'number'
const isPoint = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 2 && value.every(isNumber)

/** How each optional LiveBox field must look when a component has it (null counts as absent, as serialized scenes leave it). */
const LIVE_BOX_OPTIONAL: Record<Exclude<keyof LiveBox, 'width' | 'height'>, (value: unknown) => boolean> = {
  offsetX: isNumber,
  offsetY: isNumber,
  anchorX: isNumber,
  anchorY: isNumber,
  flipX: (value) => typeof value === 'boolean',
  frameScaleX: isNumber,
  frameScaleY: isNumber,
  shape: (value) => typeof value === 'string',
  points: (value) => Array.isArray(value) && value.every(isPoint),
}

/** A live component with a resizable box: numeric size and well-typed box fields. */
function isLiveBox(component: Component): component is Component & LiveBox {
  const read = (key: string): unknown => Reflect.get(component, key)
  return (
    isNumber(read('width')) &&
    isNumber(read('height')) &&
    Object.entries(LIVE_BOX_OPTIONAL).every(([key, check]) => read(key) == null || check(read(key)))
  )
}

export function boxShape(comp: LiveBox, role: BoxRole): 'rectangle' | 'circle' | 'polygon' {
  if (comp.shape === 'circle') return 'circle'
  if (role === 'collision' && comp.shape === 'polygon') return 'polygon'
  return 'rectangle'
}

function boxOutline(comp: LiveBox, role: BoxRole): CollisionPoint[] {
  const shape = boxShape(comp, role)
  if (shape === 'polygon') return resolveCollisionPoints(comp.points)
  if (shape === 'circle') {
    return Array.from({ length: 40 }, (_, index): CollisionPoint => {
      const angle = (index / 40) * Math.PI * 2
      return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5]
    })
  }
  return CORNERS.map(([x, y]) => [x, y])
}

export function boxHandlePoints(comp: LiveBox, role: BoxRole): CollisionPoint[] {
  return boxShape(comp, role) === 'polygon'
    ? resolveCollisionPoints(comp.points)
    : CORNERS.map(([x, y]) => [x, y])
}

/** componentBox of a live box: isLiveBox already proved width and height are numbers. */
export function liveBoxBounds(comp: LiveBox, role: BoxRole): EditorBoxBounds {
  const bounds = componentBox(comp, role)
  if (!bounds) throw new Error('componentBox rejected a live box whose width and height are numbers')
  return bounds
}

/** The normalized handle point behind rendered handle `index`; both lists come from boxHandlePoints. */
export function handleCorner(normalized: readonly CollisionPoint[], index: number): CollisionPoint {
  const corner = normalized[index]
  if (!corner) throw new Error(`box handle ${index} has no normalized corner`)
  return corner
}

/** Whether `point` lies within `threshold` of any edge of the closed outline. */
export function nearOutline(points: readonly CollisionPoint[], [x, y]: CollisionPoint, threshold: number): boolean {
  const [first] = points
  if (!first) return false
  return points.some((start, index) => pointSegmentDistance(x, y, start, points[index + 1] ?? first) <= threshold)
}

export function boxCenter(
  entity: Entity,
  comp: LiveBox,
  role: BoxRole,
  projection: ViewportProjection,
): CollisionPoint {
  if (role === 'appearance') {
    const bounds = liveBoxBounds(comp, 'appearance')
    const [entityX, entityY] = renderPoint(projection, entity.position.x, entity.position.y)
    return [entityX + bounds.centerX, entityY + bounds.centerY]
  }
  return renderPoint(
    projection,
    entity.position.x + (comp.offsetX ?? 0),
    entity.position.y + (comp.offsetY ?? 0),
  )
}

export function boxRenderPoints(
  entity: Entity,
  comp: LiveBox,
  role: BoxRole,
  projection: ViewportProjection,
  handles: boolean,
): CollisionPoint[] {
  const points = handles ? boxHandlePoints(comp, role) : boxOutline(comp, role)
  if (role === 'appearance') {
    const bounds = liveBoxBounds(comp, 'appearance')
    const [centerX, centerY] = boxCenter(entity, comp, role, projection)
    return points.map(([x, y]) => [
      centerX + x * bounds.width,
      centerY + y * bounds.height,
    ])
  }
  const centerX = entity.position.x + (comp.offsetX ?? 0)
  const centerY = entity.position.y + (comp.offsetY ?? 0)
  return renderVertices(
    projection,
    points.map(([x, y]) => [
      centerX + x * comp.width,
      centerY + y * comp.height,
    ]),
  )
}

export function appearanceOffsetForCenter(
  entity: Entity,
  comp: LiveBox,
  projection: ViewportProjection,
  centerX: number,
  centerY: number,
): CollisionPoint {
  const [entityX, entityY] = renderPoint(projection, entity.position.x, entity.position.y)
  const localX = centerX - entityX
  const localY = centerY - entityY
  const anchorX = comp.anchorX ?? 0.5
  const anchorY = comp.anchorY ?? 0.5
  const frameScaleY = comp.frameScaleY ?? 1
  const boxX = comp.flipX ? -localX : localX
  return [
    boxX - (0.5 - anchorX) * comp.width,
    localY + anchorY * comp.height - (comp.height * frameScaleY) / 2,
  ]
}

function pointSegmentDistance(
  px: number,
  py: number,
  [ax, ay]: CollisionPoint,
  [bx, by]: CollisionPoint,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** The entity's live component of one of the given types, with its box. */
export function findBox(
  entity: Entity,
  types: readonly string[],
): { comp: LiveBox; type: string } | null {
  for (const c of entity.components) {
    const type = (c.constructor as { componentName?: string }).componentName ?? ''
    if (!types.includes(type)) continue
    if (isLiveBox(c)) return { comp: c, type }
  }
  return null
}
