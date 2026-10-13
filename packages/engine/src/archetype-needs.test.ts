import { expect, it } from 'vitest'
import { sceneArchetypeNeeds, type ArchetypeManifest } from './archetype.js'

// Issue #181 CA-29: what a scene uses from its archetype, so a blank start can ship exactly that.

const FIXTURE: Pick<ArchetypeManifest, 'prefabs' | 'art' | 'registry'> = {
  prefabs: {
    'characters/hero': { waicaPrefab: 1, type: 'character', components: [{ type: 'Model', props: { src: 'waica:hero' } }] },
    'tiles/wall': { waicaPrefab: 1, type: 'tile', components: [{ type: 'Model', props: { src: 'waica:wall' } }] },
  },
  art: [
    { file: 'hero.glb', uri: 'waica:hero', kind: 'model' },
    { file: 'wall.glb', uri: 'waica:wall', kind: 'model' },
    { file: 'sky.png', uri: 'waica:sky', kind: 'image' },
  ],
  registry: { components: {}, ui: { hud: '<p>hud</p>', menu: '<p>menu</p>' } },
}

it('names the prefabs a scene spawns, the UI it lists and the art either refers to (CA-29)', () => {
  const needs = sceneArchetypeNeeds(FIXTURE, {
    waicaScene: 3,
    entities: [
      { name: 'Hero', prefab: 'characters/hero' },
      { name: 'Sky', components: [{ type: 'Backdrop', props: { texture: 'waica:sky' } }] },
      { name: 'Ghost', prefab: 'characters/missing' },
    ],
    ui: ['hud', 'gone'],
  })

  expect(needs).toEqual({ prefabs: ['characters/hero'], ui: ['hud'], art: ['hero.glb', 'sky.png'] })
})

it('needs nothing for an empty scene (CA-29)', () => {
  expect(sceneArchetypeNeeds(FIXTURE, { waicaScene: 3, entities: [] })).toEqual({ prefabs: [], ui: [], art: [] })
})
