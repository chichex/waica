// The example is a mirror of @waica/archetype-third-person: scripts/sync-scene.mjs
// writes its scene, prefabs, UI pieces and art from the archetype, turning
// 'waica:' art uris into the project's src/art/ paths. The gameplay is tested
// on the archetype and in behaviors; what this example adds is only the risk
// of a copy nobody re-synced, and this test catches exactly that.
import { expect, it } from 'vitest'
import { ARCHETYPE } from '@waica/archetype-third-person'
import type { PrefabJson, SceneJson } from '@waica/engine'
import controls from './controls.json'
import settings from './game.json'

const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', { eager: true, import: 'default' })
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const uiFiles = import.meta.glob<string>('./ui/*.html', { eager: true, query: '?raw', import: 'default' })
const artFiles = import.meta.glob('./art/*', { query: '?url', import: 'default' })

const byName = <T>(files: Record<string, T>, name: (path: string) => string): Record<string, T> =>
  Object.fromEntries(Object.entries(files).map(([path, file]) => [name(path), file]))

/** The archetype value as sync-scene writes it: every art uri replaced by its src/art path. */
function materialized(value: unknown): unknown {
  const paths = new Map(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))
  return JSON.parse(JSON.stringify(value, (_key, entry: unknown) => (typeof entry === 'string' ? (paths.get(entry) ?? entry) : entry)))
}

it('declares the third-person archetype and its bindings (CA-31)', () => {
  expect(settings.archetype).toBe('third-person')
  expect(controls.bindings).toEqual(ARCHETYPE.bindings)
})

it('ships the archetype’s demo scene and every prefab exactly as the archetype declares them (CA-31)', () => {
  const scenes = byName(sceneFiles, (path) => path.slice('./scenes/'.length, -'.scene.json'.length))
  const prefabs = byName(prefabFiles, (path) => path.slice(2, path.indexOf('.', 2)))

  expect(scenes).toEqual(materialized({ main: ARCHETYPE.scene }))
  expect(prefabs).toEqual(materialized(ARCHETYPE.prefabs))
})

it('ships the archetype’s UI pieces and one copy of every art file (CA-31)', () => {
  const pieces = byName(uiFiles, (path) => path.slice('./ui/'.length, -'.html'.length))
  expect(pieces).toEqual(ARCHETYPE.registry.ui)
  expect(Object.keys(artFiles).map((path) => path.slice('./art/'.length)).sort()).toEqual(ARCHETYPE.art.map((art) => art.file).sort())
})
