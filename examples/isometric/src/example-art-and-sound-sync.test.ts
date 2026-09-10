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

type ArchetypeArtLike = { uri: string; file: string; kind: 'image' | 'sound' }

/**
 * Every sound prop mismatch between an archetype's prefabs and a shipped
 * project's copies. Matches components by `type`, not position: the
 * archetype and the shipped file only need the same components, in any
 * order — scripts/sync-scene.mjs's keepProjectComponents appends
 * project-owned extras at the end, and nothing else promises the shipped
 * JSON keeps the archetype's own order. A type that genuinely doesn't
 * exist on the shipped side leaves `shippedComponent` undefined, so a real
 * mismatch (missing component, stale uri) is still reported — never
 * silently skipped. Two components of the same type on one entity would
 * make `.find()` pick the first and miss the second, but the engine itself
 * rejects that shape (component-update-schedule.ts's "duplicate-component":
 * "component identity must be unique"), so it can't occur here.
 */
function soundPropMismatches(
  archetypeArt: ArchetypeArtLike[],
  archetypePrefabs: Record<string, PrefabJson>,
  shippedPrefabs: Record<string, PrefabJson>,
): string[] {
  const uriToPath = new Map(archetypeArt.map((art) => [art.uri, `src/art/${art.file}`]))
  const soundUris = new Set(archetypeArt.filter((art) => art.kind === 'sound').map((art) => art.uri))

  const mismatches: string[] = []

  for (const [key, prefab] of Object.entries(archetypePrefabs)) {
    const shipped = shippedPrefabs[key]
    if (!shipped) {
      mismatches.push(`${key}: no shipped ${prefab.type} file under examples/isometric/src`)
      continue
    }

    for (const component of prefab.components) {
      const props = component.props
      if (!props) continue
      const shippedComponent = shipped.components.find((c) => c.type === component.type)
      for (const [propKey, value] of Object.entries(props)) {
        if (typeof value !== 'string' || !soundUris.has(value)) continue
        const expected = uriToPath.get(value)
        const actual = shippedComponent?.props?.[propKey]
        if (actual !== expected) {
          mismatches.push(
            `${key}.${component.type}.${propKey}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
          )
        }
      }
    }
  }

  return mismatches
}

describe('examples/isometric stays in sync with @waica/archetype-isometric', () => {
  it('ships every ARCHETYPE.art file under src/art/', () => {
    const missing = ARCHETYPE.art.map((art) => art.file).filter((file) => !shippedArtFiles.has(file))

    expect(missing).toEqual([])
  })

  it("carries every sound uri the archetype configures on its prefabs, rewritten to the project's src/art path", () => {
    const mismatches = soundPropMismatches(ARCHETYPE.art, ARCHETYPE.prefabs, shippedPrefabs)

    expect(mismatches).toEqual([])
  })

  // Regression: components used to be paired by array index, which only
  // worked because today's shipped files happen to keep the archetype's
  // component order. A legitimate reorder — the archetype adding a
  // component before an existing one, or a project hand-inserting one in
  // the middle of the shipped JSON — must not make this report a prop from
  // the wrong component.
  describe('matches shipped components by type, not array position', () => {
    const archetypeArt: ArchetypeArtLike[] = [
      { uri: 'waica:test-sound', file: 'test-sound.ogg', kind: 'sound' },
    ]
    const archetypePrefabs: Record<string, PrefabJson> = {
      'characters/example': {
        waicaPrefab: 1,
        type: 'character',
        components: [
          { type: 'AnimatedSprite', props: {} },
          { type: 'MeleeAttack', props: { swingSound: 'waica:test-sound' } },
        ],
      },
    }

    it('reports no mismatch when the shipped file lists the same components in a different order', () => {
      const shippedPrefabsOutOfOrder: Record<string, PrefabJson> = {
        'characters/example': {
          waicaPrefab: 1,
          type: 'character',
          components: [
            { type: 'MeleeAttack', props: { swingSound: 'src/art/test-sound.ogg' } },
            { type: 'AnimatedSprite', props: {} },
          ],
        },
      }

      const mismatches = soundPropMismatches(archetypeArt, archetypePrefabs, shippedPrefabsOutOfOrder)

      expect(mismatches).toEqual([])
    })

    it('still catches a genuinely stale prop on a reordered component, against the right component', () => {
      const shippedPrefabsStaleAndOutOfOrder: Record<string, PrefabJson> = {
        'characters/example': {
          waicaPrefab: 1,
          type: 'character',
          components: [
            // Reordered AND never re-synced: still the raw registry uri.
            { type: 'MeleeAttack', props: { swingSound: 'waica:test-sound' } },
            { type: 'AnimatedSprite', props: {} },
          ],
        },
      }

      const mismatches = soundPropMismatches(
        archetypeArt,
        archetypePrefabs,
        shippedPrefabsStaleAndOutOfOrder,
      )

      expect(mismatches).toEqual([
        'characters/example.MeleeAttack.swingSound: expected "src/art/test-sound.ogg", got "waica:test-sound"',
      ])
    })
  })
})
