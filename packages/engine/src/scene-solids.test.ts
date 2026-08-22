import { describe, expect, it } from 'vitest'
import { Component } from './component'
import { DynamicBody } from './components/dynamic-body'
import { Solid } from './components/solid'
import { Entity } from './entity'
import type { Game } from './game'
import {
  isSolidSource,
  sceneSolids,
  SOLID_SOURCE_SYMBOL,
  type SolidSource,
} from './scene-solids'

class SourceProbe extends Component implements SolidSource {
  readonly [SOLID_SOURCE_SYMBOL] = true
  readonly derived: Solid[] = []
  solids(): readonly Solid[] {
    return this.derived
  }
}

function makeWorld(): { game: Game; spawn(name: string): Entity } {
  const entities: Entity[] = []
  const game = {
    entities,
    applyParamOverrides: () => {},
    removeEntity: () => {},
  } as unknown as Game
  return {
    game,
    spawn(name) {
      const entity = new Entity(game, name)
      entities.push(entity)
      return entity
    },
  }
}

function derivedSolid(owner: Entity, offsetX: number): Solid {
  const solid = new Solid()
  solid.entity = owner
  solid.game = owner.game
  solid.offsetX = offsetX
  return solid
}

describe('sceneSolids', () => {
  it('keeps the established one-Solid-per-entity order when no source exists', () => {
    const world = makeWorld()
    const except = world.spawn('Mover')
    const first = world.spawn('First').add(Solid)
    world.spawn('No solid').add(ComponentProbe)
    const second = world.spawn('Second').add(Solid)

    expect(sceneSolids(world.game, except)).toEqual([first, second])
  })

  it('collects source-owned Solids in component order and respects except', () => {
    const world = makeWorld()
    const directEntity = world.spawn('Direct')
    const direct = directEntity.add(Solid)
    const sourceEntity = world.spawn('Source')
    const source = sourceEntity.add(SourceProbe)
    source.derived.push(derivedSolid(sourceEntity, 1), derivedSolid(sourceEntity, 2))

    expect(isSolidSource(source)).toBe(true)
    expect(isSolidSource(direct)).toBe(false)
    expect(sceneSolids(world.game)).toEqual([direct, ...source.derived])
    expect(sceneSolids(world.game, sourceEntity)).toEqual([direct])
  })

  it('does not treat multiple DynamicBody components as recursive solid sources', () => {
    const world = makeWorld()
    const firstBody = world.spawn('First body').add(DynamicBody)
    const wall = world.spawn('Wall').add(Solid)
    const secondBody = world.spawn('Second body').add(DynamicBody)

    expect(isSolidSource(firstBody)).toBe(false)
    expect(isSolidSource(secondBody)).toBe(false)
    expect(sceneSolids(world.game)).toEqual([wall])
  })
})

class ComponentProbe extends Component {}
