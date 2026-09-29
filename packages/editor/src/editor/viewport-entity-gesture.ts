// Moving entities and selecting them by area in the edit viewport: a group
// drag that keeps every member's offset to the grabbed one, and the marquee
// rectangle that replaces the selection with the entities inside it.
import type { CollisionPoint, Entity, Game } from '@waica/engine'
import { snapActive, snapPoint } from './grid'
import { logicalAt, projectionOf } from './viewport-boxes'
import type { DragPointer, EditorWorld, ViewportLive } from './viewport-live'
import { logicalPoint, renderPoint } from './viewport-space'

interface DragMember {
  name: string
  ox: number
  oy: number
}

/** Entity drag: the grabbed anchor plus every group member's pointer offset. */
export interface EntityDrag {
  anchor: DragMember
  members: DragMember[]
}

/** Marquee selection in logical world coordinates, plus where it started on screen. */
export interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
  cx0: number
  cy0: number
}

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

interface ClientPoint {
  clientX: number
  clientY: number
}

/** Whether grabbing `name` drags the whole multi-selection (and keeps it). */
export function grabsGroup(live: ViewportLive, name: string): boolean {
  const multi = live.multiSelected ?? []
  return multi.length > 1 && multi.includes(name)
}

export function beginEntityDrag({ game, live }: EditorWorld, hit: Entity, point: CollisionPoint): EntityDrag | null {
  const [logicalX, logicalY] = logicalAt(live, point)
  const names = grabsGroup(live, hit.name) ? (live.multiSelected ?? []) : [hit.name]
  const members = names.flatMap((name) => {
    const entity = name === hit.name ? hit : game.find(name)
    return entity ? [{ name, ox: logicalX - entity.position.x, oy: logicalY - entity.position.y }] : []
  })
  const anchor = members.find((m) => m.name === hit.name) ?? members[0]
  return anchor ? { anchor, members } : null
}

/** The grabbed entity snaps; the rest keep their logical offsets to it. */
export function dragEntities({ game, live }: EditorWorld, drag: EntityDrag, pointer: DragPointer): void {
  const projection = projectionOf(live.scene)
  const [logicalX, logicalY] = logicalAt(live, pointer.point)
  const rawX = logicalX - drag.anchor.ox
  const rawY = logicalY - drag.anchor.oy
  let [x, y] = [rawX, rawY]
  if (snapActive(live.grid.snap, pointer.shiftKey)) {
    const rawRender = renderPoint(projection, rawX, rawY)
    const snapped = snapPoint(live.grid, rawRender[0], rawRender[1])
    ;[x, y] = logicalPoint(projection, snapped[0], snapped[1])
  }
  for (const m of drag.members) {
    game.find(m.name)?.position.set(logicalX - m.ox + (x - rawX), logicalY - m.oy + (y - rawY), 0)
  }
}

/** Where each dragged entity ended, rounded like the Inspector shows it. */
export function entityMoves(game: Game | null, drag: EntityDrag): Array<{ name: string; position: [number, number] }> {
  return drag.members.flatMap((m) => {
    const entity = game?.find(m.name)
    if (!entity) return []
    const position: [number, number] = [
      Math.round(entity.position.x * 100) / 100,
      Math.round(entity.position.y * 100) / 100,
    ]
    return [{ name: m.name, position }]
  })
}

export function beginMarquee([x, y]: CollisionPoint, client: ClientPoint): Marquee {
  return { x0: x, y0: y, x1: x, y1: y, cx0: client.clientX, cy0: client.clientY }
}

/** Extends the marquee to a new logical corner; returns its on-screen rectangle. */
export function extendMarquee(marquee: Marquee, [x, y]: CollisionPoint, client: ClientPoint): ScreenRect {
  marquee.x1 = x
  marquee.y1 = y
  return {
    left: Math.min(marquee.cx0, client.clientX),
    top: Math.min(marquee.cy0, client.clientY),
    width: Math.abs(client.clientX - marquee.cx0),
    height: Math.abs(client.clientY - marquee.cy0),
  }
}

/** The scene entities whose live position lies inside the marquee. */
export function marqueeSelection({ game, live }: { game: Game | null; live: ViewportLive }, marquee: Marquee): string[] {
  const { x0, y0, x1, y1 } = marquee
  const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)]
  const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)]
  return live.scene.entities
    .filter((ent) => {
      const entity = game?.find(ent.name)
      if (!entity) return false
      const { x, y } = entity.position
      return x >= minX && x <= maxX && y >= minY && y <= maxY
    })
    .map((ent) => ent.name)
}
