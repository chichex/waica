// Editing a selected entity's component box with the pointer: resizing it
// from a corner, moving one polygon vertex, or moving the whole box by its
// outline — live on the component, then committed once on pointer-up.
import { resolveCollisionPoints, type CollisionPoint, type Entity, type Game } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'
import { cornerResize } from './box-math'
import { snapActive, snapPoint } from './grid'
import {
  appearanceOffsetForCenter,
  boxCenter,
  findBox,
  liveBoxBounds,
  projectionOf,
  type BoxRole,
  type LiveBox,
} from './viewport-boxes'
import type { DragPointer, EditorWorld, ViewportLive } from './viewport-live'
import type { HandleHit, OutlineHit } from './viewport-pointer-targets'
import { logicalPoint, type ViewportProjection } from './viewport-space'

export type BoxDrag =
  /** ax/ay: the opposite corner in the quantity's own space, pinned for the drag. */
  | { kind: 'box'; name: string; compType: string; role: BoxRole; ax: number; ay: number }
  | { kind: 'polygon'; name: string; compType: string; role: BoxRole; point: number }
  | { kind: 'move'; name: string; compType: string; role: BoxRole; ox: number; oy: number }

export interface BoxCommits {
  onBoxResized?(name: string, componentType: string, size: [number, number], offset: [number, number]): void
  onBoxMoved?: (name: string, componentType: string, offset: [number, number]) => void
  onPolygonChanged?: (name: string, componentType: string, points: CollisionPoint[]) => void
}

interface BoxTarget {
  entity: Entity
  comp: LiveBox
  projection: ViewportProjection
}

const round = (value: number, precision: number): number => Math.round(value * precision) / precision

function snapped(grid: GridSettings, { point, shiftKey }: DragPointer): CollisionPoint {
  return snapActive(grid.snap, shiftKey) ? snapPoint(grid, point[0], point[1]) : point
}

/** The live entity and component box a drag edits, if both still exist. */
function draggedBox(game: Game | null, { name, compType }: { name: string; compType: string }) {
  const entity = game?.find(name)
  const box = entity && findBox(entity, [compType])
  return entity && box ? { entity, comp: box.comp } : null
}

/** A corner drag, or a polygon-vertex drag, starting on the handle under the pointer. */
export function beginHandleDrag(game: Game, live: ViewportLive, handle: HandleHit): BoxDrag | null {
  if (handle.kind === 'polygon') return handle
  const box = draggedBox(game, handle)
  if (!box) return null
  const { entity, comp } = box
  const projection = projectionOf(live.scene)
  const bounds = liveBoxBounds(comp, handle.role)
  const center: CollisionPoint =
    handle.role === 'appearance'
      ? boxCenter(entity, comp, handle.role, projection)
      : [entity.position.x + (comp.offsetX ?? 0), entity.position.y + (comp.offsetY ?? 0)]
  return {
    kind: 'box',
    name: handle.name,
    compType: handle.compType,
    role: handle.role,
    ax: center[0] - handle.corner[0] * bounds.width,
    ay: center[1] - handle.corner[1] * bounds.height,
  }
}

/** Moving the whole box, keeping the pointer's offset from its center. */
export function beginOutlineDrag(outline: OutlineHit, [wx, wy]: CollisionPoint): BoxDrag {
  const { name, compType, role, center } = outline
  return { kind: 'move', name, compType, role, ox: wx - center[0], oy: wy - center[1] }
}

function moveBox({ entity, comp, projection }: BoxTarget, drag: Extract<BoxDrag, { kind: 'move' }>, center: CollisionPoint): void {
  if (drag.role === 'appearance') {
    ;[comp.offsetX, comp.offsetY] = appearanceOffsetForCenter(entity, comp, projection, center[0], center[1])
    return
  }
  const [logicalX, logicalY] = logicalPoint(projection, center[0], center[1])
  comp.offsetX = logicalX - entity.position.x
  comp.offsetY = logicalY - entity.position.y
}

function movePolygonVertex({ entity, comp, projection }: BoxTarget, index: number, [wx, wy]: CollisionPoint): void {
  const [logicalX, logicalY] = logicalPoint(projection, wx, wy)
  const centerX = entity.position.x + (comp.offsetX ?? 0)
  const centerY = entity.position.y + (comp.offsetY ?? 0)
  const points = resolveCollisionPoints(comp.points)
  const width = Math.abs(comp.width) > 0.001 ? comp.width : 1
  const height = Math.abs(comp.height) > 0.001 ? comp.height : 1
  points[index] = [(logicalX - centerX) / width, (logicalY - centerY) / height]
  comp.points = points
}

/** A corner drag pins the opposite corner in logical space for collision and render space for appearance. */
function resizeBox({ entity, comp, projection }: BoxTarget, drag: Extract<BoxDrag, { kind: 'box' }>, [wx, wy]: CollisionPoint): void {
  if (drag.role === 'collision') {
    const [logicalX, logicalY] = logicalPoint(projection, wx, wy)
    const next = cornerResize(drag.ax, drag.ay, logicalX, logicalY)
    comp.width = next.width
    comp.height = next.height
    comp.offsetX = next.centerX - entity.position.x
    comp.offsetY = next.centerY - entity.position.y
    return
  }
  const next = cornerResize(drag.ax, drag.ay, wx, wy)
  comp.width = next.width / (Math.abs(comp.frameScaleX ?? 1) || 1)
  comp.height = next.height / (Math.abs(comp.frameScaleY ?? 1) || 1)
  ;[comp.offsetX, comp.offsetY] = appearanceOffsetForCenter(entity, comp, projection, next.centerX, next.centerY)
}

/** Applies one pointer move of `drag` to the live component. */
export function dragBox({ game, live }: EditorWorld, drag: BoxDrag, pointer: DragPointer): void {
  const box = draggedBox(game, drag)
  if (!box) return
  const target = { ...box, projection: projectionOf(live.scene) }
  if (drag.kind === 'move') {
    const [wx, wy] = pointer.point
    moveBox(target, drag, snapped(live.grid, { ...pointer, point: [wx - drag.ox, wy - drag.oy] }))
  } else if (drag.kind === 'polygon') {
    movePolygonVertex(target, drag.point, snapped(live.grid, pointer))
  } else {
    resizeBox(target, drag, snapped(live.grid, pointer))
  }
}

/** Reports the dragged box's final geometry, rounded like the Inspector shows it. */
export function commitBoxDrag(game: Game | null, drag: BoxDrag, commits: BoxCommits): void {
  const comp = draggedBox(game, drag)?.comp
  if (!comp) return
  const offset: [number, number] = [round(comp.offsetX ?? 0, 100), round(comp.offsetY ?? 0, 100)]
  if (drag.kind === 'move') {
    commits.onBoxMoved?.(drag.name, drag.compType, offset)
  } else if (drag.kind === 'polygon') {
    const points = resolveCollisionPoints(comp.points).map(([x, y]): CollisionPoint => [round(x, 1000), round(y, 1000)])
    commits.onPolygonChanged?.(drag.name, drag.compType, points)
  } else {
    commits.onBoxResized?.(drag.name, drag.compType, [round(comp.width, 100), round(comp.height, 100)], offset)
  }
}
