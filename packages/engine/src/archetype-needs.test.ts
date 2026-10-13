import { expect, it } from 'vitest'
import { sceneArchetypeNeeds, type ArchetypeManifest } from './archetype.js'
import { Component } from './component.js'

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

/** A component whose `ref: 'ui'` params name UI pieces, one by default. */
class Banner extends Component {
  static override componentName = 'Banner'
  static override params = { piece: { label: 'Piece', ref: 'ui' as const }, label: { label: 'Label' } }
  piece = 'menu'
  label = 'hud'
}

it('also names the UI pieces the ref ui params of the components it uses hold, declared or by default (CA-29)', () => {
  const archetype = {
    ...FIXTURE,
    prefabs: { ...FIXTURE.prefabs, 'objects/sign': { waicaPrefab: 1 as const, type: 'object' as const, components: [{ type: 'Banner' }] } },
    registry: { components: { Banner }, ui: { hud: '<p>hud</p>', menu: '<p>menu</p>', toast: '<p>toast</p>' } },
  }
  const scene = (entities: ArchetypeScene['entities']) => ({ waicaScene: 3 as const, entities })

  expect(sceneArchetypeNeeds(archetype, scene([{ name: 'Sign', prefab: 'objects/sign' }])).ui).toEqual(['menu'])
  expect(sceneArchetypeNeeds(archetype, scene([{ name: 'Inline', components: [{ type: 'Banner', props: { piece: 'toast' } }] }])).ui).toEqual(['toast'])
})

type ArchetypeScene = Parameters<typeof sceneArchetypeNeeds>[1]
