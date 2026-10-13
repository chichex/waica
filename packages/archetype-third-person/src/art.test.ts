import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { THIRD_PERSON_ART } from './art'
import { KNIGHT_CLIPS, SKELETON_CLIPS, THIRD_PERSON_PREFABS } from './prefabs'

// Issue #181 CA-24: the art, trimmed to the clips the roles' states name.

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))
/** The assets directory's cap, also checked on the packed package by `pnpm test:dist`. */
const ASSETS_CAP = 3_145_728

/** The clip names in a glb's JSON chunk. */
function glbClips(file: string): string[] {
  const bytes = readFileSync(`${ASSETS}${file}`)
  expect(bytes.toString('latin1', 0, 4), file).toBe('glTF')
  const length = bytes.readUInt32LE(12)
  const json: unknown = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'))
  const animations: unknown = Reflect.get(json as object, 'animations')
  return Array.isArray(animations) ? animations.map((animation: unknown) => String(Reflect.get(animation as object, 'name'))) : []
}

/** The clips a prefab's StateMachine names, one per state. */
function statesClips(prefab: string): string[] {
  const machine = THIRD_PERSON_PREFABS[prefab]?.components.find((component) => component.type === 'StateMachine')
  const states = (machine?.props?.states ?? {}) as Record<string, { clip?: string }>
  return Object.entries(states).flatMap(([name, state]) => (name === '*' ? [] : [state.clip ?? name]))
}

it('keeps exactly the clips the character role’s states name in knight.glb (CA-24)', () => {
  expect(glbClips('knight.glb').sort()).toEqual([...new Set(statesClips('characters/player'))].sort())
  expect(new Set(Object.values(KNIGHT_CLIPS))).toEqual(new Set(statesClips('characters/player')))
})

it('keeps exactly the clips the enemy role’s states name in skeleton-warrior.glb (CA-24)', () => {
  expect(glbClips('skeleton-warrior.glb').sort()).toEqual([...new Set(statesClips('characters/skeleton'))].sort())
  expect(new Set(Object.values(SKELETON_CLIPS))).toEqual(new Set(statesClips('characters/skeleton')))
})

it('ships one asset per art row, plus ATTRIBUTION.md, within 3 MB (CA-24)', () => {
  const files = readdirSync(ASSETS).sort()
  expect(files).toEqual([...THIRD_PERSON_ART.map((art) => art.file), 'ATTRIBUTION.md'].sort())
  const total = files.reduce((sum, file) => sum + statSync(`${ASSETS}${file}`).size, 0)
  expect(total).toBeLessThanOrEqual(ASSETS_CAP)
  const attribution = readFileSync(`${ASSETS}ATTRIBUTION.md`, 'utf8')
  for (const art of THIRD_PERSON_ART) expect(attribution, art.file).toContain(`\`${art.file}\``)
  expect(attribution).toContain('CC0')
  expect(attribution).toContain('node scripts/trim-character-glb.mjs')
})
