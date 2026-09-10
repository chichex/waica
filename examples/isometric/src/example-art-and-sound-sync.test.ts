// The example ships its OWN copies of the archetype's art and prefabs
// (see scripts/sync-scene.mjs) instead of importing ARCHETYPE at build
// time — main.ts globs `./art/*` and `./characters|objects|tiles/*.json`
// directly (examples/isometric/src/main.ts:39-65). So `pnpm dev:isometric`
// plays exactly what is checked into this directory, not what the
// archetype package declares. Nothing enforces that the two stay in sync
// other than remembering to run the sync script — this test is that
// enforcement, general enough to catch the next drift (a new stock art
// file, or a new sound prop on any prefab), not just today's regression.
//
// Loads the shipped files through import.meta.glob, the same mechanism
// main.ts itself uses, instead of node:fs — this package's tsconfig only
// declares "vite/client" types (no @types/node), matching every other
// example test file's convention of staying browser-only.
import { describe, expect, it } from 'vitest'
import { ARCHETYPE } from '@waica/archetype-isometric'
import type { PrefabJson } from '@waica/engine'

const artFiles = import.meta.glob<string>('./art/*', {
  eager: true,
  query: '?url',
  import: 'default',
})
const shippedArtFiles = new Set(Object.keys(artFiles).map((path) => path.slice('./art/'.length)))

const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const shippedPrefabs: Record<string, PrefabJson> = {}
for (const [path, prefab] of Object.entries(prefabFiles)) {
  // './characters/orc.character.json' -> 'characters/orc'
  shippedPrefabs[path.slice(2, path.indexOf('.', 2))] = prefab
}

describe('examples/isometric stays in sync with @waica/archetype-isometric', () => {
  it('ships every ARCHETYPE.art file under src/art/', () => {
    const missing = ARCHETYPE.art.map((art) => art.file).filter((file) => !shippedArtFiles.has(file))

    expect(missing).toEqual([])
  })

  it("carries every sound uri the archetype configures on its prefabs, rewritten to the project's src/art path", () => {
    const uriToPath = new Map(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))
    const soundUris = new Set(
      ARCHETYPE.art.filter((art) => art.kind === 'sound').map((art) => art.uri),
    )

    const mismatches: string[] = []

    for (const [key, prefab] of Object.entries(ARCHETYPE.prefabs)) {
      const shipped = shippedPrefabs[key]
      if (!shipped) {
        mismatches.push(`${key}: no shipped ${prefab.type} file under examples/isometric/src`)
        continue
      }

      prefab.components.forEach((component, index) => {
        const props = component.props
        if (!props) return
        for (const [propKey, value] of Object.entries(props)) {
          if (typeof value !== 'string' || !soundUris.has(value)) continue
          const expected = uriToPath.get(value)
          const shippedComponent: PrefabJson['components'][number] | undefined =
            shipped.components[index]
          const actual = shippedComponent?.props?.[propKey]
          if (actual !== expected) {
            mismatches.push(
              `${key}.${component.type}.${propKey}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
            )
          }
        }
      })
    }

    expect(mismatches).toEqual([])
  })
})
