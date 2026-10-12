import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import { validateProject } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

/** A character prefab whose `attack` state leaves on `clip:end`, with the given AnimatedSprite clips. */
async function projectWithAttack(clips: Record<string, unknown>): Promise<string> {
  const project = await makeProject({
    'src/characters/hero.character.json': JSON.stringify({
      waicaPrefab: 1,
      type: 'character',
      components: [
        { type: 'AnimatedSprite', props: { clips } },
        {
          type: 'StateMachine',
          props: {
            role: 'player',
            initial: 'idle',
            states: {
              idle: { transitions: [{ on: 'input:attack', to: 'attack' }] },
              attack: { transitions: [{ on: 'clip:end', to: 'idle' }] },
            },
          },
        },
        { type: 'PlatformerMotor' },
      ],
    }),
  })
  roots.push(project)
  return project
}

const codesOf = async (project: string, code: string) =>
  (await validateProject(project)).findings.filter((finding) => finding.code === code)

/**
 * The same `attack` state under a directional archetype: two facings, west
 * mirroring east, and the contract's `attack → idle` state fallback, as the
 * topdown and isometric manifests declare theirs (review of PR #167).
 */
async function directionalProjectWithAttack(clips: Record<string, unknown>): Promise<string> {
  const project = await projectWithAttack(clips)
  await stubPackage(project, '@waica/archetype-fixture', {
    manifest: `
module.exports.ARCHETYPE = {
  id: 'fixture', label: 'Fixture', scene: { waicaScene: 3, entities: [] },
  blankScene: { waicaScene: 3, entities: [] },
  registry: { components: {}, prefabs: {}, ui: {} }, palette: [], prefabs: {}, art: [],
  entityIcons: {}, actionLabels: {}, bundle: { roles: {} },
  animation: {
    directions: ['e', 'w'],
    fallbacks: { w: { dir: 'e', flip: true } },
    contract: { required: ['idle'], fallbacks: { attack: 'idle' } },
  },
}
`,
  })
  const pkgPath = path.join(project, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
  pkg.dependencies['@waica/archetype-fixture'] = '^9.0.0'
  await writeFile(pkgPath, JSON.stringify(pkg))
  await writeFile(path.join(project, 'src/game.json'), JSON.stringify({ waicaGame: 1, archetype: 'fixture' }))
  return project
}

describe('clip:end in validate_project (issue #166 CA-2)', () => {
  it('accepts clip:end as a trigger and warns when the state plays a clip that loops', async () => {
    const project = await projectWithAttack({
      idle: { frames: [0], fps: 1 },
      attack: { frames: [0, 1, 2, 3], fps: 8 },
    })

    const result = await validateProject(project)

    const looping = result.findings.filter((finding) => finding.code === 'clip-end-on-looping-clip')
    expect(looping).toHaveLength(1)
    expect(looping[0]).toMatchObject({ severity: 'warning', file: 'src/characters/hero.character.json', ref: 'characters/hero' })
    expect(looping[0]?.message).toMatch(/"attack".*clip:end.*loops/)
    expect(result.findings.filter((finding) => finding.code === 'missing-clip')).toHaveLength(0)
  })

  it('reports nothing for a clip:end edge on a non-looping clip', async () => {
    const project = await projectWithAttack({
      idle: { frames: [0], fps: 1 },
      attack: { frames: [0, 1, 2, 3], fps: 8, loop: false },
    })

    expect(await codesOf(project, 'clip-end-on-looping-clip')).toEqual([])
  })

  it('reports only missing-clip when the clip:end state has no clip at all', async () => {
    const project = await projectWithAttack({ idle: { frames: [0], fps: 1 } })

    expect(await codesOf(project, 'clip-end-on-looping-clip')).toEqual([])
    expect(await codesOf(project, 'missing-clip')).toHaveLength(1)
  })
})

describe('clip:end against a directional contract (review of PR #167)', () => {
  it('warns when the directional clips the state resolves to loop: attack-e plays for both facings and loops', async () => {
    const project = await directionalProjectWithAttack({
      'idle-e': { frames: [0], fps: 1 },
      'attack-e': { frames: [0, 1, 2, 3], fps: 8 },
    })

    const looping = await codesOf(project, 'clip-end-on-looping-clip')
    expect(looping).toHaveLength(1)
    expect(looping[0]?.message).toMatch(/"attack".*clip:end.*"attack-e" loops/)
    expect(await codesOf(project, 'missing-clip')).toEqual([])
  })

  it('reports nothing when the directional one-shot does not loop', async () => {
    const project = await directionalProjectWithAttack({
      'idle-e': { frames: [0], fps: 1 },
      'attack-e': { frames: [0, 1, 2, 3], fps: 8, loop: false },
    })

    expect(await codesOf(project, 'clip-end-on-looping-clip')).toEqual([])
    expect(await codesOf(project, 'missing-clip')).toEqual([])
  })

  it('warns when the state has no clip of its own and the contract falls back to a looping one: attack → idle-e', async () => {
    const project = await directionalProjectWithAttack({ 'idle-e': { frames: [0], fps: 1 } })

    const looping = await codesOf(project, 'clip-end-on-looping-clip')
    expect(looping).toHaveLength(1)
    expect(looping[0]?.message).toMatch(/"attack".*clip:end.*"idle-e" loops/)
    expect(await codesOf(project, 'missing-clip')).toEqual([])
  })
})
