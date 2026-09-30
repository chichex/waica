import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { cleanup, createAndValidateDemo, readJson } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

type Archetype = 'platformer' | 'topdown' | 'isometric'

/** The component types of a generated prefab file, in order. */
async function prefabTypes(project: string, file: string): Promise<string[]> {
  const prefab = await readJson<PrefabJson>(path.join(project, 'src', file))
  return prefab.components.map((component) => component.type)
}

/** Each named scene entity's prefab ref. */
async function scenePrefabs(project: string, file: string): Promise<Record<string, string | undefined>> {
  const scene = await readJson<SceneJson>(path.join(project, 'src/scenes', file))
  return Object.fromEntries(scene.entities.map((entity) => [entity.name, entity.prefab]))
}

/** The particle cues each archetype's player prefab carries, after its ParticleEmitter. */
const PLAYER_CUE: Readonly<Record<Archetype, string>> = {
  platformer: 'DustPuffs',
  topdown: 'DustTrail',
  isometric: 'SwingSparks',
}

describe('create_project demos ship the archetype particle effects', () => {
  it.each(['platformer', 'topdown', 'isometric'] as const)(
    'the %s demo player carries its emitter and cue, and validates without unknown components',
    async (archetype) => {
      const { project, findings } = await createAndValidateDemo(archetype, roots)
      const types = await prefabTypes(project, 'characters/player.character.json')

      const emitter = types.indexOf('ParticleEmitter')
      const cue = types.indexOf(PLAYER_CUE[archetype])
      expect(emitter, types.join(', ')).toBeGreaterThan(types.indexOf('StateMachine'))
      expect(cue, types.join(', ')).toBeGreaterThan(emitter)
      expect(findings.filter((finding) => finding.code === 'unknown-component')).toEqual([])
    },
  )

  it('the isometric demo stages wind and hurt smoke in main, and dust (no wind) in the cave', async () => {
    const { project } = await createAndValidateDemo('isometric', roots)

    const main = await scenePrefabs(project, 'main.scene.json')
    expect(main['Wind']).toBe('objects/wind')
    expect(main['HurtSmoke']).toBe('objects/hurt-smoke')
    const cave = await scenePrefabs(project, 'cave.scene.json')
    expect(cave['Dust']).toBe('objects/cave-dust')
    expect(cave['Wind']).toBeUndefined()
    expect(await prefabTypes(project, 'objects/wind.object.json')).toEqual(['ParticleEmitter'])
    expect(await prefabTypes(project, 'objects/hurt-smoke.object.json')).toEqual([
      'ParticleEmitter',
      'DamagePuff',
    ])
    expect(await prefabTypes(project, 'objects/cave-dust.object.json')).toEqual(['ParticleEmitter'])
  })
})
