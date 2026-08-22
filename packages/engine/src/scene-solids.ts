import { Solid } from './components/solid.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'

/** Explicit opt-in brand for components that derive collision Solids. */
export const SOLID_SOURCE_SYMBOL = Symbol('waica.solidSource')

/** Component seam for geometry that derives one or more collision Solids. */
export interface SolidSource {
  readonly [SOLID_SOURCE_SYMBOL]: true
  solids(): readonly Solid[]
}

export function isSolidSource(value: unknown): value is SolidSource {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<SolidSource>
  return candidate[SOLID_SOURCE_SYMBOL] === true && typeof candidate.solids === 'function'
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
