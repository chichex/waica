import { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'

/** Component seam for geometry that derives one or more collision Solids. */
export interface SolidSource {
  solids(): readonly Solid[]
}

export function isSolidSource(value: unknown): value is SolidSource {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as SolidSource).solids === 'function'
  )
}

/**
 * All static collision geometry in stable entity/component order. Without a
 * SolidSource this is exactly one direct Solid per entity, as before.
 */
export function sceneSolids(game: Game, except?: Entity): Solid[] {
  const result: Solid[] = []
  for (const entity of game.entities) {
    if (entity === except) continue
    const direct = entity.get(Solid)
    if (direct) result.push(direct)
    for (const component of entity.components ?? []) {
      if (isSolidSource(component)) result.push(...component.solids())
    }
  }
  return result
}
