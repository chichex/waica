import { Entity, Hitbox, type Game } from '@waica/engine'
import { describe, expect, it } from 'vitest'
import { findBox } from './viewport-boxes'

function entityWith(component: object): Entity {
  const entity = new Entity({} as unknown as Game, 'probe')
  entity.components.push(Object.assign(new Hitbox(), component))
  return entity
}

describe('findBox', () => {
  it('still finds a hitbox whose serialized points are null, so its box and handles show', () => {
    const entity = entityWith({ width: 2, height: 1, points: null })
    expect(findBox(entity, ['Hitbox'])?.type).toBe('Hitbox')
  })

  it('still finds a hitbox whose optional offsets are null', () => {
    const entity = entityWith({ width: 2, height: 1, offsetX: null, offsetY: null })
    expect(findBox(entity, ['Hitbox'])?.type).toBe('Hitbox')
  })

  it('ignores a component whose size is not numeric', () => {
    const entity = entityWith({ width: '2', height: 1 })
    expect(findBox(entity, ['Hitbox'])).toBeNull()
  })
})
