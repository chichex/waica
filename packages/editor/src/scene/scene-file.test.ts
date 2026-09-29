import { describe, expect, it } from 'vitest'
import { migrateScene } from './ops'
import { InvalidSceneFileError, isPrefabJson, parseSceneJson } from './scene-file'

const VALID_SCENE = {
  waicaScene: 3,
  camera: { position: [1, 2], zoom: 8, follow: 'Hero', limits: { minX: 0, maxX: 9, minY: 0, maxY: 5 } },
  render: { sort: 'y', projection: 'isometric' },
  entities: [
    {
      name: 'Hero',
      position: [0, 1],
      prefab: 'characters/hero',
      overrides: { Motor: { speed: 3 } },
      components: [{ type: 'Sprite', props: { url: 'src/art/hero.png' } }],
      folder: 'Actors',
    },
    { name: 'Bare' },
  ],
  ui: ['score'],
  folders: ['Actors'],
}

describe('parseSceneJson', () => {
  it('returns a scene whose every field has the declared shape', () => {
    expect(parseSceneJson(JSON.stringify(VALID_SCENE))).toEqual(VALID_SCENE)
  })

  it.each([
    ['entities missing', { waicaScene: 3 }, 'entities must be an array'],
    ['entities not an array', { waicaScene: 3, entities: {} }, 'entities must be an array'],
    ['an entity that is not an object', { waicaScene: 3, entities: [{ name: 'A' }, 7] }, 'entities[1] must be an object'],
    ['not an object', [], 'a scene file must hold a JSON object'],
  ])('rejects a scene with %s before migrating it', (_label, scene, reason) => {
    expect(() => parseSceneJson(JSON.stringify(scene))).toThrow(new InvalidSceneFileError(reason))
  })

  it.each([
    ['no version marker', { entities: [{ name: 'A' }] }],
    ['a version the editor does not know', { waicaScene: 9, entities: [{ name: 'A' }] }],
    ['a three-component position', { waicaScene: 3, entities: [{ name: 'A', position: [1, 2, 3] }] }],
    ['a component without props object', { waicaScene: 3, entities: [{ name: 'A', components: [{ type: 'Sprite', props: 'x' }] }] }],
    ['an unnamed entity', { waicaScene: 3, entities: [{}] }],
  ])('opens a scene the game still loads: %s', (_label, scene) => {
    expect(parseSceneJson(JSON.stringify(scene))).toEqual(scene)
  })

  it('lets migrateScene handle an entity whose prefab is not a string, as the game loads it', () => {
    const scene = parseSceneJson('{"waicaScene":3,"entities":[{"name":"A","prefab":7}]}')
    expect(migrateScene(scene)).toBe(scene)
  })

  it('keeps invalid JSON a syntax error', () => {
    expect(() => parseSceneJson('{')).toThrow(SyntaxError)
  })
})

describe('isPrefabJson', () => {
  it('accepts a prefab file and rejects a wrong kind or component list', () => {
    const prefab = { waicaPrefab: 1, type: 'character', components: [{ type: 'Sprite' }] }
    expect(isPrefabJson(prefab)).toBe(true)
    expect(isPrefabJson({ ...prefab, type: 'vehicle' })).toBe(false)
    expect(isPrefabJson({ ...prefab, components: 'Sprite' })).toBe(false)
    expect(isPrefabJson({ ...prefab, waicaPrefab: 2 })).toBe(false)
  })
})
