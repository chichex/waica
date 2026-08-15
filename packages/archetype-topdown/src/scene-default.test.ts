import { describe, expect, it } from 'vitest'
import { TOPDOWN_PREFABS } from './prefabs'
import { TOPDOWN_BLANK_SCENE, TOPDOWN_SCENE } from './scene-default'
import { TOPDOWN_UI } from './ui'

describe('TOPDOWN_SCENE', () => {
  it('renders y-sorted with a two-axis follow camera clamped to the meadow', () => {
    expect(TOPDOWN_SCENE.waicaScene).toBe(3)
    expect(TOPDOWN_SCENE.render).toEqual({ sort: 'y' })
    expect(TOPDOWN_SCENE.camera?.follow).toBe('Player')
    expect(TOPDOWN_SCENE.camera?.lookaheadY).toBeGreaterThan(0)
    expect(TOPDOWN_SCENE.camera?.limits).toBeDefined()
  })

  it('references only prefabs the archetype declares, with unique names', () => {
    const names = new Set<string>()
    for (const entity of TOPDOWN_SCENE.entities) {
      expect(TOPDOWN_PREFABS[entity.prefab!], entity.name).toBeDefined()
      expect(names.has(entity.name), entity.name).toBe(false)
      names.add(entity.name)
    }
  })

  it('places trees inside the walkable field so occlusion flips both ways', () => {
    const limits = TOPDOWN_SCENE.camera!.limits!
    const trees = TOPDOWN_SCENE.entities.filter((e) => e.prefab === 'tiles/tree')
    expect(trees.length).toBeGreaterThanOrEqual(2)
    for (const tree of trees) {
      const [, y] = tree.position!
      expect(y - 1, tree.name).toBeGreaterThanOrEqual(limits.minY)
      expect(y + 1, tree.name).toBeLessThanOrEqual(limits.maxY)
    }
  })

  it('stages the whole demo cast: villager, blob and potions to collect', () => {
    const byPrefab = (ref: string) =>
      TOPDOWN_SCENE.entities.filter((entity) => entity.prefab === ref)
    expect(byPrefab('characters/player')).toHaveLength(1)
    expect(byPrefab('characters/villager')).toHaveLength(1)
    expect(byPrefab('characters/blob')).toHaveLength(1)
    expect(byPrefab('objects/potion').length).toBeGreaterThanOrEqual(3)
  })

  it('starts with the potion counter; the npc line only shows on interact', () => {
    expect(TOPDOWN_SCENE.ui).toEqual(['potion-counter'])
    expect(Object.keys(TOPDOWN_UI).sort()).toEqual(['npc-line', 'potion-counter'])
    for (const piece of TOPDOWN_SCENE.ui ?? []) {
      expect(TOPDOWN_UI[piece], piece).toBeDefined()
    }
  })
})

describe('TOPDOWN_BLANK_SCENE', () => {
  it('keeps y-sorted rendering with no follow and no entities', () => {
    expect(TOPDOWN_BLANK_SCENE.waicaScene).toBe(3)
    expect(TOPDOWN_BLANK_SCENE.render).toEqual({ sort: 'y' })
    expect(TOPDOWN_BLANK_SCENE.camera?.follow).toBeUndefined()
    expect(TOPDOWN_BLANK_SCENE.entities).toEqual([])
  })
})
