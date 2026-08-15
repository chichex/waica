import { describe, expect, it } from 'vitest'
import { TOPDOWN_PREFABS } from './prefabs.js'
import { TOPDOWN_REGISTRY_DATA } from './registry-data.js'

function componentTypes(ref: string): string[] {
  return TOPDOWN_PREFABS[ref]!.components.map((component) => component.type)
}

function props(ref: string, type: string): Record<string, unknown> {
  const component = TOPDOWN_PREFABS[ref]!.components.find((c) => c.type === type)
  return (component?.props ?? {}) as Record<string, unknown>
}

describe('the topdown prefabs express the genre model', () => {
  it('gives the player health and a spawn, but no fall-out-of-world plumbing', () => {
    expect(componentTypes('characters/player')).toContain('Respawnable')
    expect(props('characters/player', 'Health')).toMatchObject({ max: 3, invulnerability: 1 })
    for (const ref of Object.keys(TOPDOWN_PREFABS)) {
      expect(componentTypes(ref), ref).not.toContain('OutOfBounds')
      expect(componentTypes(ref), ref).not.toContain('DynamicBody')
    }
  })

  it('ships a code-free villager: npc role, a line to say, and a body that blocks', () => {
    expect(props('characters/villager', 'StateMachine')).toMatchObject({ role: 'npc' })
    const interactable = props('characters/villager', 'Interactable')
    expect(String(interactable['line']).length).toBeGreaterThan(0)
    expect(interactable['radius']).toBeGreaterThan(0)
    expect(componentTypes('characters/villager')).toContain('Solid')
  })

  it('makes the blob hurt on any contact — no stomping without gravity', () => {
    expect(props('characters/blob', 'Hazard')).toMatchObject({
      stompable: false,
      contactDamage: 1,
    })
    expect(componentTypes('characters/blob')).toContain('Patrol')
  })

  it('keeps ground tiles under the y-sort bands of everything that occludes', () => {
    expect(props('tiles/meadow', 'Sprite')['layer']).toBe(-2)
    for (const ref of ['tiles/grass', 'tiles/path', 'tiles/water']) {
      expect(props(ref, 'Sprite')['layer'], ref).toBe(-1)
    }
    for (const ref of ['tiles/tree', 'tiles/fence', 'characters/player', 'characters/villager']) {
      expect(props(ref, 'Sprite')['layer'], ref).toBeUndefined()
      expect(props(ref, 'AnimatedSprite')['layer'], ref).toBeUndefined()
    }
  })

  it('anchors the tree at its trunk with a footprint smaller than the canopy', () => {
    expect(props('tiles/tree', 'Sprite')).toMatchObject({ height: 2, offsetY: 0.5 })
    const solid = props('tiles/tree', 'Solid')
    expect(solid['width']).toBeLessThan(1)
    expect(solid['height']).toBeLessThan(1)
  })

  it('declares solids on obstacles and none on walkable ground', () => {
    for (const ref of ['tiles/water', 'tiles/fence', 'tiles/tree']) {
      expect(componentTypes(ref), ref).toContain('Solid')
    }
    for (const ref of ['tiles/meadow', 'tiles/grass', 'tiles/path']) {
      expect(componentTypes(ref), ref).not.toContain('Solid')
    }
  })

  it('registers every component the prefabs name', () => {
    const registered = new Set(Object.keys(TOPDOWN_REGISTRY_DATA.components))
    for (const [ref, prefab] of Object.entries(TOPDOWN_PREFABS)) {
      for (const component of prefab.components) {
        expect(registered.has(component.type), `${ref} → ${component.type}`).toBe(true)
      }
    }
  })
})
