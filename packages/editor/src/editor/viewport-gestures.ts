// The edit viewport's pointer gestures as one state machine: what a
// pointer-down starts (first match wins, in priority order), how each
// gesture follows the pointer, and what it commits on pointer-up.
import type { Game } from '@waica/engine'
import { finishStroke } from './tilemap-brush'
import { snapActive, snapPoint } from './grid'
import { beginHandleDrag, beginOutlineDrag, commitBoxDrag, dragBox, type BoxCommits, type BoxDrag } from './viewport-box-gesture'
import { logicalAt } from './viewport-boxes'
import { orthographicCamera } from './viewport-camera'
import {
  beginEntityDrag,
  beginMarquee,
  dragEntities,
  entityMoves,
  extendMarquee,
  grabsGroup,
  marqueeSelection,
  type EntityDrag,
  type Marquee,
  type ScreenRect,
} from './viewport-entity-gesture'
import type { DragPointer, EditorWorld, ViewportLive } from './viewport-live'
import { hitBoxOutline, hitCameraMarker, hitHandle, pickEntityAt } from './viewport-pointer-targets'
import { armedTilemap, beginPaint, continuePaint, type PaintStroke } from './viewport-tilemap-paint'

export type Gesture =
  | { kind: 'paint'; paint: PaintStroke }
  | { kind: 'box'; drag: BoxDrag }
  | { kind: 'camera'; ox: number; oy: number }
  | { kind: 'entities'; drag: EntityDrag }
  | { kind: 'marquee'; marquee: Marquee }
  | { kind: 'pan'; px: number; py: number }

/** A pointer-down that was handled but started no drag (a Shift-toggle, a paint off the map). */
const HANDLED = { kind: 'handled' } as const

export interface GestureCallbacks extends BoxCommits {
  onSelect: (name: string | null) => void
  onToggleSelect?: (name: string) => void
  onRangeSelect?: (names: string[]) => void
  onSelectCamera?: () => void
  onMoved: (name: string, position: [number, number]) => void
  onMovedMany?: (moves: Array<{ name: string; position: [number, number] }>) => void
  onCameraMoved?: (position: [number, number]) => void
  onTilemapStroke?: (name: string, cells: number[]) => void
}

/** The pointer in world space plus its client position (for screen overlays and panning). */
export interface GesturePointer extends DragPointer {
  clientX: number
  clientY: number
}

export interface GestureHost {
  callbacks: GestureCallbacks
  showCamera: boolean
  canvas: { current: HTMLCanvasElement | null }
  /** Live scene-camera position while its gizmo is dragged (read by the camera gizmo). */
  cameraDrag: { current: { x: number; y: number } | null }
  showMarquee: (rect: ScreenRect | null) => void
}

/** One pointer event over the live world, with what the gestures report to. */
export interface PointerStep {
  world: EditorWorld
  at: GesturePointer
  host: GestureHost
}

type Began = Gesture | typeof HANDLED | null

function beginOnTilemap({ world, at }: PointerStep): Began {
  const tilemap = armedTilemap(world)
  if (!tilemap) return null
  const paint = beginPaint(world, tilemap, at)
  return paint ? { kind: 'paint', paint } : HANDLED
}

function beginOnSelectedBox({ world, at }: PointerStep): Began {
  const handle = hitHandle(world.game, world.live, at.point)
  if (handle) {
    const drag = beginHandleDrag(world.game, world.live, handle)
    return drag ? { kind: 'box', drag } : HANDLED
  }
  const outline = hitBoxOutline(world.game, world.live, at.point)
  return outline ? { kind: 'box', drag: beginOutlineDrag(outline, at.point) } : null
}

/** The camera's center marker sits above entities: it wins the pick. */
function beginOnCameraMarker({ world, at, host }: PointerStep): Began {
  const select = host.callbacks.onSelectCamera
  if (!host.showCamera || !select) return null
  const offset = hitCameraMarker(world.game, world.live, at.point)
  if (!offset) return null
  select()
  return { kind: 'camera', ...offset }
}

function beginOnEntity({ world, at, host }: PointerStep): Began {
  const hit = pickEntityAt(world.game, world.live, at.point)
  if (!hit) return null
  const { onToggleSelect, onSelect } = host.callbacks
  if (at.shiftKey && onToggleSelect) {
    onToggleSelect(hit.name)
    return HANDLED
  }
  // Grabbing a member of the multi-selection drags the whole group
  // (and keeps the group); anything else collapses to single-select.
  if (!grabsGroup(world.live, hit.name)) onSelect(hit.name)
  const drag = beginEntityDrag(world, hit, at.point)
  return drag ? { kind: 'entities', drag } : HANDLED
}

function beginOnEmptySpace({ world, at, host }: PointerStep): Began {
  if (at.shiftKey && host.callbacks.onRangeSelect) {
    host.showMarquee({ left: at.clientX, top: at.clientY, width: 0, height: 0 })
    return { kind: 'marquee', marquee: beginMarquee(logicalAt(world.live, at.point), at) }
  }
  host.callbacks.onSelect(null)
  return { kind: 'pan', px: at.clientX, py: at.clientY }
}

const POINTER_DOWN_TARGETS = [beginOnTilemap, beginOnSelectedBox, beginOnCameraMarker, beginOnEntity, beginOnEmptySpace]

/** What a pointer-down on the edit viewport starts, or null when it starts no drag. */
export function beginGesture(down: PointerStep): Gesture | null {
  for (const begin of POINTER_DOWN_TARGETS) {
    const began = begin(down)
    if (began) return began.kind === 'handled' ? null : began
  }
  return null
}

function panCamera({ world: { game }, host, at }: PointerStep, pan: Extract<Gesture, { kind: 'pan' }>): Gesture {
  const rect = host.canvas.current?.getBoundingClientRect()
  if (!rect) return pan
  const camera = orthographicCamera(game.camera)
  if (!camera) return pan
  const perPx = (camera.right - camera.left) / rect.width
  camera.position.x -= (at.clientX - pan.px) * perPx
  camera.position.y += (at.clientY - pan.py) * perPx
  return { kind: 'pan', px: at.clientX, py: at.clientY }
}

function dragCameraMarker({ world, host, at }: PointerStep, drag: { ox: number; oy: number }): void {
  const [wx, wy] = at.point
  const grid = world.live.grid
  let [x, y] = [wx - drag.ox, wy - drag.oy]
  if (snapActive(grid.snap, at.shiftKey)) [x, y] = snapPoint(grid, x, y)
  host.cameraDrag.current = { x, y }
}

/** Follows the pointer with the running gesture; returns the gesture to keep. */
export function dragGesture(step: PointerStep, gesture: Gesture): Gesture {
  const { world, host, at } = step
  switch (gesture.kind) {
    case 'paint':
      return { kind: 'paint', paint: continuePaint(world, gesture.paint, at) }
    case 'box':
      dragBox(world, gesture.drag, at)
      return gesture
    case 'camera':
      dragCameraMarker(step, gesture)
      return gesture
    case 'entities':
      dragEntities(world, gesture.drag, at)
      return gesture
    case 'marquee':
      host.showMarquee(extendMarquee(gesture.marquee, logicalAt(world.live, at.point), at))
      return gesture
    case 'pan':
      return panCamera(step, gesture)
  }
}

function commitEntityMoves(game: Game | null, drag: EntityDrag, { onMoved, onMovedMany }: GestureCallbacks): void {
  const moves = entityMoves(game, drag)
  if (moves.length > 1 && onMovedMany) onMovedMany(moves)
  else if (moves[0]) onMoved(moves[0].name, moves[0].position)
}

function commitMarquee(world: { game: Game | null; live: ViewportLive }, host: GestureHost, marquee: Marquee): void {
  const names = marqueeSelection(world, marquee)
  if (names.length > 0) host.callbacks.onRangeSelect?.(names)
  else host.callbacks.onSelect(null)
  host.showMarquee(null)
}

function commitCameraMarker({ cameraDrag, callbacks }: GestureHost): void {
  const moved = cameraDrag.current
  if (moved) callbacks.onCameraMoved?.([Math.round(moved.x * 100) / 100, Math.round(moved.y * 100) / 100])
}

/** Commits what the gesture changed, once, on pointer-up. */
export function endGesture(world: { game: Game | null; live: ViewportLive }, host: GestureHost, gesture: Gesture): void {
  const { callbacks } = host
  switch (gesture.kind) {
    case 'paint': {
      const cells = finishStroke(gesture.paint.stroke)
      if (cells) callbacks.onTilemapStroke?.(gesture.paint.name, cells)
      return
    }
    case 'box':
      commitBoxDrag(world.game, gesture.drag, callbacks)
      return
    case 'entities':
      commitEntityMoves(world.game, gesture.drag, callbacks)
      return
    case 'marquee':
      commitMarquee(world, host, gesture.marquee)
      return
    case 'camera':
      commitCameraMarker(host)
      return
    case 'pan':
      return
  }
}
