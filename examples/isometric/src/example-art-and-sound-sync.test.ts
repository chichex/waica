// The example ships its OWN copies of the archetype's art and prefabs
// (see scripts/sync-scene.mjs) instead of importing ARCHETYPE at build
// time — main.ts globs `./art/*` and `./characters|objects|tiles/*.json`
// directly (examples/isometric/src/main.ts:39-65). So `pnpm dev:isometric`
// plays exactly what is checked into this directory, not what the
// archetype package declares. Nothing enforces that the two stay in sync
// other than remembering to run the sync script — this test is that
// enforcement, general enough to catch the next drift (a new stock art
// file, or a new sound prop on any prefab), not just today's regression.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ARCHETYPE } from '@waica/archetype-isometric'
import type { PrefabJson } from '@waica/engine'

const exampleSrc = dirname(fileURLToPath(import.meta.url))

describe('examples/isometric stays in sync with @waica/archetype-isometric', () => {
  it('ships every ARCHETYPE.art file under src/art/', () => {
    const missing = ARCHETYPE.art
      .map((art) => art.file)
      .filter((file) => !existsSync(join(exampleSrc, 'art', file)))

    expect(missing).toEqual([])
  })

  it("carries every sound uri the archetype configures on its prefabs, rewritten to the project's src/art path", () => {
    const uriToPath = new Map(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))
    const soundUris = new Set(
      ARCHETYPE.art.filter((art) => art.kind === 'sound').map((art) => art.uri),
    )

    const mismatches: string[] = []

    for (const [key, prefab] of Object.entries(ARCHETYPE.prefabs)) {
      const shippedPath = join(exampleSrc, `${key}.${prefab.type}.json`)
      if (!existsSync(shippedPath)) {
        mismatches.push(`${key}: no shipped file at ${shippedPath}`)
        continue
      }
      const shipped = JSON.parse(readFileSync(shippedPath, 'utf8')) as PrefabJson

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
