// The example is a mirror of @waica/archetype-isometric: scripts/sync-scene.mjs
// writes its scenes and prefabs from the archetype, turning 'waica:' art uris
// into the project's src/art/ paths. The particle effects' gameplay is tested
// once, on the archetype itself (packages/archetype-isometric/src/
// particle-effects.test.ts). What this example adds is only the risk of a copy
// nobody re-synced, and this test catches exactly that.
import { describe, expect, it } from 'vitest'
import { ARCHETYPE } from '@waica/archetype-isometric'
import type { PrefabJson, SceneJson } from '@waica/engine'

const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', { eager: true, import: 'default' })
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)

const byName = <T>(files: Record<string, T>, name: (path: string) => string): Record<string, T> =>
  Object.fromEntries(Object.entries(files).map(([path, file]) => [name(path), file]))

/** The archetype value as sync-scene writes it: every art uri replaced by its src/art path. */
function materialized(value: unknown): unknown {
  const paths = new Map(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) => (typeof entry === 'string' ? (paths.get(entry) ?? entry) : entry)),
  )
}

describe('examples/isometric is a synced copy of the archetype', () => {
  it('ships every archetype scene, main and extra, exactly as the archetype declares it', () => {
    const scenes = byName(sceneFiles, (path) => path.slice('./scenes/'.length, -'.scene.json'.length))

    expect(scenes).toEqual(materialized({ main: ARCHETYPE.scene, ...ARCHETYPE.extraScenes }))
  })

  it('ships every archetype prefab exactly as the archetype declares it', () => {
    const prefabs = byName(prefabFiles, (path) => path.slice(2, path.indexOf('.', 2)))

    expect(prefabs).toEqual(materialized(ARCHETYPE.prefabs))
  })
})
