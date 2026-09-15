import { describe, expect, it } from 'vitest'
import { authoringDefaults } from '../authoring-defaults.js'
import { Hitbox } from './hitbox.js'

describe('Hitbox collision categories', () => {
  it('exposes authorable default layer and directional mask values', () => {
    const hitbox = new Hitbox()

    expect(hitbox.layer).toBe('default')
    expect(hitbox.collidesWith).toEqual(['*'])
    expect(Hitbox.params).toMatchObject({
      layer: { label: 'Collision Layer' },
      collidesWith: { label: 'Collision Mask', kind: 'string-list' },
    })
    expect(authoringDefaults(Hitbox)).toMatchObject({
      layer: 'default',
      collidesWith: ['*'],
    })
  })
})
