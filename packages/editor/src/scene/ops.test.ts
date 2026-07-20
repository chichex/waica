import { describe, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { migrateScene } from './ops'

describe('migrateScene', () => {
  it('turns legacy ui/* entities into ui list entries', () => {
    const scene: SceneJson = {
      waicaScene: 2,
      entities: [
        { name: 'Player', prefab: 'characters/player', position: [0, 0] },
        { name: 'Hud', prefab: 'ui/coin-counter', position: [0, 0] },
      ],
    }
    const next = migrateScene(scene)
    expect(next.entities.map((e) => e.name)).toEqual(['Player'])
    expect(next.ui).toEqual(['coin-counter'])
  })

  it('does not duplicate pieces already in the ui list', () => {
    const scene: SceneJson = {
      waicaScene: 2,
      entities: [{ name: 'Hud', prefab: 'ui/coin-counter', position: [0, 0] }],
      ui: ['coin-counter'],
    }
    expect(migrateScene(scene).ui).toEqual(['coin-counter'])
  })

  it('returns modern scenes untouched', () => {
    const scene: SceneJson = {
      waicaScene: 3,
      camera: { position: [0, 0], zoom: 12 },
      entities: [{ name: 'Player', prefab: 'characters/player', position: [0, 0] }],
      ui: ['coin-counter'],
    }
    expect(migrateScene(scene)).toBe(scene)
  })
})
