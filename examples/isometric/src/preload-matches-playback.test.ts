// CA-9: game.audio.preload() in main.ts exists so the first real play() of a
// combat sound never pays for its own fetch+decode. That only holds when the
// preloaded uris are the exact ones play() resolves at runtime — otherwise
// preload() warms different files (the archetype package's own copies, via
// ARCHETYPE.registry.resolveAsset) than the ones the shipped prefabs
// actually reference (this project's own src/art/ copies, via artUrls).
//
// This derives the expected uri set from the shipped prefab JSON and the
// archetype's own `art`/`music` fields — never a literal copy of main.ts's
// array — so it keeps failing if the two ever drift apart again, including
// if the sounds themselves change later (a new sound prop, a renamed file).
import { describe, expect, it } from 'vitest'
import { ARCHETYPE } from '@waica/archetype-isometric'
import type { PrefabJson } from '@waica/engine'

const mainTsFiles = import.meta.glob<string>('./main.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const mainTsSource = Object.values(mainTsFiles)[0]
if (!mainTsSource) throw new Error('could not load ./main.ts as raw text')

const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)

/** Pulls the literal string array main.ts passes to game.audio.preload(). */
function preloadUrisInMainTs(source: string): string[] {
  const call = source.match(/game\.audio\.preload\(\[([\s\S]*?)\]\)/)
  if (!call) throw new Error('could not find a game.audio.preload([...]) call in main.ts')
  return [...call[1]!.matchAll(/'([^']+)'/g)].map((match) => match[1]!)
}

describe('main.ts preloads exactly what it plays (CA-9)', () => {
  it('preloads every sound uri the shipped prefabs reference, plus the archetype music', () => {
    const soundArtFiles = new Set(
      ARCHETYPE.art.filter((art) => art.kind === 'sound').map((art) => `src/art/${art.file}`),
    )

    const referencedSoundPaths = new Set<string>()
    for (const prefab of Object.values(prefabFiles)) {
      for (const component of prefab.components) {
        for (const value of Object.values(component.props ?? {})) {
          if (typeof value === 'string' && soundArtFiles.has(value)) {
            referencedSoundPaths.add(value)
          }
        }
      }
    }
    // Sanity: the shipped prefabs actually reference at least one sound —
    // otherwise the equality below would trivially pass on an empty set.
    expect(referencedSoundPaths.size).toBeGreaterThan(0)

    const expectedPreloadUris = new Set(referencedSoundPaths)
    if (ARCHETYPE.music) expectedPreloadUris.add(ARCHETYPE.music)

    const actualPreloadUris = new Set(preloadUrisInMainTs(mainTsSource))

    expect([...actualPreloadUris].sort()).toEqual([...expectedPreloadUris].sort())
  })
})
