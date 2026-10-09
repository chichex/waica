// What lies under the pointer in the edit viewport: world coordinates of a
// client point, the topmost entity, a selected box's handle or outline, and
// the scene camera's drag marker.
import type { CollisionPoint, Entity, Game } from '@waica/engine'
import { resolveOrthographicCamera } from '../scene/camera-block'
import {
  BOX_KINDS,
  boxCenter,
  boxHandlePoints,
  boxRenderPoints,
  boxShape,
  entityBounds,
  findBox,
  handleCorner,
  nearOutline,
  projectionOf,
  type BoxRole,
} from './viewport-boxes'
import { orthographicCamera } from './viewport-camera'
import type { ViewportLive } from './viewport-live'
import { pickRenderBounds } from './viewport-space'

export type HandleHit =
  | { kind: 'box'; name: string; compType: string; role: BoxRole; corner: CollisionPoint }
  | { kind: 'polygon'; name: string; compType: string; role: BoxRole; point: number }

export interface OutlineHit {
  name: string
  compType: string
  role: BoxRole
  center: CollisionPoint
}

/** The world point under a client position, through the live camera. */
export function toWorld(
  canvas: HTMLCanvasElement | null,
  game: Game | null,
  e: { clientX: number; clientY: number },
): [number, number] {
  if (!canvas || !game) return [0, 0]
  const rect = canvas.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width
  const ny = (e.clientY - rect.top) / rect.height
  // Only a 2D scene's orthographic camera maps a client point onto the world plane.
  const c = orthographicCamera(game.camera)
  if (!c) return [0, 0]
  return [
    c.position.x + c.left + nx * (c.right - c.left),
    c.position.y + c.top - ny * (c.top - c.bottom),
  ]
}

/** The topmost entity whose render bounds contain the world point. */
export function pickEntityAt(game: Game, live: ViewportLive, [wx, wy]: CollisionPoint): Entity | null {
  const projection = projectionOf(live.scene)
  for (let i = game.entities.length - 1; i >= 0; i--) {
    const entity = game.entities[i]
    if (entity && pickRenderBounds(projection, { x: wx, y: wy }, entity.position, entityBounds(entity, projection))) {
      return entity
    }
  }
  return null
}

/** The selected entity's boxes on visible layers, in hit-test order. */
function selectedBoxes(game: Game, live: ViewportLive) {
  const name = live.selected
  const entity = name ? game.find(name) : undefined
  if (!name || !entity) return []
  return BOX_KINDS.flatMap(({ types, role }) => {
    const box = live.componentVisibility[role] ? findBox(entity, types) : null
    return box ? [{ name, entity, role, ...box }] : []
  })
}

/** A box corner or freeform polygon vertex under the pointer. */
export function hitHandle(game: Game, live: ViewportLive, [wx, wy]: CollisionPoint): HandleHit | null {
  // Slightly larger than the visual handle so it's easy to grab.
  const hs = game.view * 0.02
  const projection = projectionOf(live.scene)
  for (const { name, entity, role, comp, type } of selectedBoxes(game, live)) {
    const rendered = boxRenderPoints(entity, comp, role, projection, true)
    const index = rendered.findIndex(([x, y]) => Math.abs(wx - x) <= hs && Math.abs(wy - y) <= hs)
    if (index < 0) continue
    return boxShape(comp, role) === 'polygon'
      ? { kind: 'polygon', name, compType: type, role, point: index }
      : { kind: 'box', name, compType: type, role, corner: handleCorner(boxHandlePoints(comp, role), index) }
  }
  return null
}

/** An appearance or collision outline that can be dragged independently. */
export function hitBoxOutline(game: Game, live: ViewportLive, point: CollisionPoint): OutlineHit | null {
  const threshold = game.view * 0.012
  const projection = projectionOf(live.scene)
  for (const { name, entity, role, comp, type } of selectedBoxes(game, live)) {
    const points = boxRenderPoints(entity, comp, role, projection, false)
    if (nearOutline(points, point, threshold)) {
      return { name, compType: type, role, center: boxCenter(entity, comp, role, projection) }
    }
  }
  return null
}

/**
 * The pointer's offset from the scene camera's center marker, when it is on
 * it. While following there is no marker — the camera rides its target and
 * is only selectable from the Explorer.
 */
export function hitCameraMarker(game: Game, live: ViewportLive, [wx, wy]: CollisionPoint): { ox: number; oy: number } | null {
  const sceneCam = resolveOrthographicCamera(live.scene.camera)
  const [px, py] = sceneCam.position
  const hs = game.view * 0.035
  if (sceneCam.follow || Math.abs(wx - px) > hs || Math.abs(wy - py) > hs) return null
  return { ox: wx - px, oy: wy - py }
}

/** Hover feedback: resize on handles, move on component outlines. */
export function hoverCursor(game: Game, live: ViewportLive, point: CollisionPoint): string {
  const hit = hitHandle(game, live, point)
  if (hit?.kind === 'polygon') return 'move'
  if (hit) return hit.corner[0] * hit.corner[1] > 0 ? 'nesw-resize' : 'nwse-resize'
  return hitBoxOutline(game, live, point) ? 'move' : ''
}
