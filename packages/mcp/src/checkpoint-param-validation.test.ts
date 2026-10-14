import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkpointParamFindings } from './checkpoint-param-validation.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// Checkpoint.spawnOffset is a vector3, judged like a Collider's offset: a
// short array or a string would respawn the player at NaN or a silent 0.

beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const FILE = 'src/scenes/main.scene.json'
const refs = (props: unknown): Array<string | undefined> => checkpointParamFindings(props, FILE, 'Banner').map((finding) => finding.ref)

describe('Checkpoint params', () => {
  it('accepts the default, an absent spawnOffset and three finite numbers', () => {
    expect(checkpointParamFindings(undefined, FILE, 'Banner')).toEqual([])
    expect(checkpointParamFindings({}, FILE, 'Banner')).toEqual([])
    expect(checkpointParamFindings({ spawnOffset: [0, 0, 1.35] }, FILE, 'Banner')).toEqual([])
  })

  it('reports invalid-checkpoint-param for a spawnOffset that is not three finite numbers', () => {
    for (const spawnOffset of [[0, 1], [0, 0, 0, 1], 'front', [0, 'up', 0], [0, Number.NaN, 0], null]) {
      expect(refs({ spawnOffset }), JSON.stringify(spawnOffset)).toEqual(['Banner:Checkpoint.spawnOffset'])
    }
    const [finding] = checkpointParamFindings({ spawnOffset: [0, 1] }, FILE, 'Banner')
    expect(finding).toMatchObject({ severity: 'error', code: 'invalid-checkpoint-param', file: FILE })
    expect(finding?.message).toContain('three finite numbers [x, y, z]')
  })

  it('reaches validate_project from a scene entity, a prefab and an override', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        render: { space: '3d' },
        camera: { kind: 'perspective' },
        entities: [
          { name: 'Banner', components: [{ type: 'Checkpoint', props: { spawnOffset: [0, 1] } }] },
          { name: 'Flag', prefab: 'objects/flag', overrides: { Checkpoint: { spawnOffset: 'front' } } },
        ],
      }),
      'src/objects/flag.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Checkpoint', props: { spawnOffset: [0, 0, 'z'] } }],
      }),
    })
    roots.push(project)
    const { findings } = await validateProject(project)
    expect(findings.filter((finding) => finding.code === 'invalid-checkpoint-param').map((finding) => finding.ref)).toEqual([
      'objects/flag:Checkpoint.spawnOffset',
      'Banner:Checkpoint.spawnOffset',
      'Flag:Checkpoint.spawnOffset',
    ])
  })
})
