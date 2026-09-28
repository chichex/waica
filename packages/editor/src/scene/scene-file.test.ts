import { describe, expect, it } from 'vitest'
import { InvalidSceneFileError, isPrefabJson, isSceneJson, parseSceneJson } from './scene-file'

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
    ['an unnamed entity', { waicaScene: 3, entities: [{}] }, 'entities[0].name must be a string'],
    ['an unknown version', { waicaScene: 9, entities: [] }, 'waicaScene must be 1, 2 or 3'],
    ['not an object', [], 'a scene file must hold a JSON object'],
  ])('rejects a scene with %s before migrating it', (_label, scene, reason) => {
    expect(() => parseSceneJson(JSON.stringify(scene))).toThrow(new InvalidSceneFileError(reason))
  })

  it('keeps invalid JSON a syntax error', () => {
    expect(() => parseSceneJson('{')).toThrow(SyntaxError)
  })
})

describe('isSceneJson', () => {
  it.each([
    ['a bad position', { name: 'A', position: [1] }],
    ['a component without a type', { name: 'A', components: [{ props: {} }] }],
    ['overrides that are not objects', { name: 'A', overrides: { Motor: 3 } }],
    ['a non-string prefab', { name: 'A', prefab: 7 }],
    ['a non-string folder', { name: 'A', folder: true }],
  ])('rejects an entity with %s', (_label, entity) => {
    expect(isSceneJson({ waicaScene: 3, entities: [entity] })).toBe(false)
  })

  it.each([
    ['a camera zoom that is not a number', { camera: { zoom: 'far' } }],
    ['camera limits missing an edge', { camera: { limits: { minX: 0, maxX: 1, minY: 0 } } }],
    ['an unknown render sort', { render: { sort: 'x' } }],
    ['ui names that are not strings', { ui: [1] }],
    ['folders that are not strings', { folders: [null] }],
  ])('rejects a scene with %s', (_label, extra) => {
    expect(isSceneJson({ waicaScene: 3, entities: [], ...extra })).toBe(false)
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
