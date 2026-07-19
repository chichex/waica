import { describe, expect, it, vi } from 'vitest'
import { resolveEntityComponents, type PrefabJson, type SceneEntityJson } from './scene'

const SLIME: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [
    { type: 'Sprite', props: { src: 'waica:slime', width: 16 } },
    { type: 'Hitbox', props: { w: 14, h: 10 } },
  ],
}

const PREFABS = { 'characters/slime': SLIME }

describe('resolveEntityComponents', () => {
  it('passes inline components through when there is no prefab ref', () => {
    const entity: SceneEntityJson = {
      name: 'coin',
      components: [{ type: 'Sprite', props: { src: 'coin.png' } }],
    }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'coin.png' } },
    ])
  })

  it('resolves to an empty list without prefab or components', () => {
    expect(resolveEntityComponents({ name: 'empty' })).toEqual([])
  })

  it('expands the prefab components', () => {
    const entity: SceneEntityJson = { name: 'slime-1', prefab: 'characters/slime' }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'waica:slime', width: 16 } },
      { type: 'Hitbox', props: { w: 14, h: 10 } },
    ])
  })

  it('shallow-merges overrides on top of the prefab props', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      overrides: { Sprite: { width: 32 } },
    }
    const [sprite, hitbox] = resolveEntityComponents(entity, PREFABS)
    expect(sprite).toEqual({ type: 'Sprite', props: { src: 'waica:slime', width: 32 } })
    expect(hitbox).toEqual({ type: 'Hitbox', props: { w: 14, h: 10 } })
  })

  it('ignores overrides for a component type the prefab lacks', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      overrides: { Patrol: { speed: 40 } },
    }
    const result = resolveEntityComponents(entity, PREFABS)
    expect(result.map((c) => c.type)).toEqual(['Sprite', 'Hitbox'])
  })

  it('appends inline components after the prefab ones', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      components: [{ type: 'Patrol', props: { speed: 40 } }],
    }
    const result = resolveEntityComponents(entity, PREFABS)
    expect(result.map((c) => c.type)).toEqual(['Sprite', 'Hitbox', 'Patrol'])
    expect(result[2]).toEqual({ type: 'Patrol', props: { speed: 40 } })
  })

  it('warns and falls back to inline components on an unknown prefab', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entity: SceneEntityJson = {
      name: 'ghost',
      prefab: 'characters/ghost',
      components: [{ type: 'Sprite', props: { src: 'ghost.png' } }],
    }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'ghost.png' } },
    ])
    expect(warn).toHaveBeenCalledWith('[waica] unknown prefab in scene: "characters/ghost" (ghost)')
    warn.mockRestore()
  })

  it('warns too when no prefab map is given at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveEntityComponents({ name: 'ghost', prefab: 'characters/ghost' })).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('never mutates its inputs and returns fresh component objects', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'Sprite', props: { width: 16 } }],
    }
    const entity: SceneEntityJson = {
      name: 'box',
      prefab: 'objects/box',
      overrides: { Sprite: { width: 32 } },
    }
    const [sprite] = resolveEntityComponents(entity, { 'objects/box': prefab })
    expect(sprite).not.toBe(prefab.components[0])
    sprite!.props!.width = 99
    expect(prefab.components[0]!.props).toEqual({ width: 16 })
    expect(entity.overrides).toEqual({ Sprite: { width: 32 } })
  })
})
