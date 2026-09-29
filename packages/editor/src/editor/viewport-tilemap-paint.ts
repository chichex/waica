// Painting (or, with Shift, erasing) tilemap cells with the armed brush: the
// stroke shows live on the Tilemap and is committed once on pointer-up.
import { Tilemap, type Game } from '@waica/engine'
import { beginStroke, reduceStroke, type TilemapStroke } from './tilemap-brush'
import { logicalAt } from './viewport-boxes'
import { liveComponent } from './viewport-game'
import type { DragPointer, EditorWorld } from './viewport-live'

export interface PaintStroke {
  name: string
  stroke: TilemapStroke
}

function showStroke(game: Game, { name, stroke }: PaintStroke): void {
  const component = liveComponent(game, name, 'Tilemap')
  if (component) Reflect.set(component, 'cells', [...stroke.cells])
}

/** The selected entity's Tilemap when the brush is armed to paint on it. */
export function armedTilemap({ game, live }: EditorWorld): Tilemap | null {
  const brush = live.tilemapBrush
  if (!brush?.paint || brush.entity !== live.selected) return null
  return game.find(brush.entity)?.get(Tilemap) ?? null
}

/** Starts a stroke on the cell under the pointer; null when the pointer is off the map. */
export function beginPaint(world: EditorWorld, tilemap: Tilemap, { point, shiftKey }: DragPointer): PaintStroke | null {
  const brush = world.live.tilemapBrush
  const cell = tilemap.cellAt(...logicalAt(world.live, point))
  if (!brush || !cell) return null
  const stroke = reduceStroke(
    beginStroke(tilemap.cells, tilemap.mapWidth, tilemap.mapHeight),
    cell.column,
    cell.row,
    shiftKey ? -1 : brush.tile,
  )
  const paint = { name: brush.entity, stroke }
  showStroke(world.game, paint)
  return paint
}

/** Extends the stroke to the cell under the pointer; returns it unchanged when nothing new was painted. */
export function continuePaint(world: EditorWorld, paint: PaintStroke, { point, shiftKey }: DragPointer): PaintStroke {
  const brush = world.live.tilemapBrush
  const tilemap = world.game.find(paint.name)?.get(Tilemap)
  const cell = tilemap?.cellAt(...logicalAt(world.live, point))
  if (!brush || !cell) return paint
  const stroke = reduceStroke(paint.stroke, cell.column, cell.row, shiftKey ? -1 : brush.tile)
  if (stroke === paint.stroke) return paint
  const next = { ...paint, stroke }
  showStroke(world.game, next)
  return next
}
