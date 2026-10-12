import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject } from './test-helpers.js'
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
