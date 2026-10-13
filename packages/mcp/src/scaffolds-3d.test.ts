import { afterEach, beforeAll, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { installArchetype, type PrefabJson } from '@waica/engine'
import { ARCHETYPE as THIRD_PERSON } from '@waica/archetype-third-person/manifest'
import type { CharacterIdentity } from '../../editor/src/project/chassis.js'
import { newPrefabComponents3d } from '../../editor/src/project/chassis-3d.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { scaffoldPrefab } from './scaffolds.js'
import { validateProject } from './validation.js'
import { cleanup, makeProject } from './test-helpers.js'

// Issue #181 CA-30 (D-4): scaffold_prefab in a 3D archetype emits a 3D component set.

beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function thirdPersonProject(): Promise<string> {
  const project = await makeProject({
    'package.json': JSON.stringify({
      name: 'tp-scaffold',
      private: true,
      type: 'module',
      dependencies: { '@waica/engine': '^0.1.0', '@waica/behaviors': '^0.1.0', '@waica/archetype-third-person': '^0.1.0' },
    }),
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'third-person' }),
  })
  roots.push(project)
  return project
}

/** A character scaffolded with the identity of the same name as its role. */
async function scaffolded(project: string, name: string, role: 'player' | 'enemy'): Promise<PrefabJson> {
  const result = await scaffoldPrefab(project, name, 'character', role, role)
  return JSON.parse(await readFile(path.join(project, result.path), 'utf8')) as PrefabJson
}

const typesOf = (prefab: PrefabJson): string[] => prefab.components.map((component) => component.type)

it('gives a 3D player a Model, a kinematic body, a capsule, its machine and its motor, and no Animator (CA-30)', async () => {
  const project = await thirdPersonProject()
  const prefab = await scaffolded(project, 'hero', 'player')

  expect(typesOf(prefab).slice(0, 5)).toEqual(['Model', 'RigidBody', 'Collider', 'StateMachine', 'CharacterMotor'])
  expect(typesOf(prefab)).not.toContain('Animator')
  expect(prefab.components[1]?.props).toEqual({ type: 'kinematic' })
  expect(prefab.components[2]?.props).toMatchObject({ shape: 'capsule' })
  expect(prefab.components[3]?.props).toMatchObject({ role: 'player', initial: 'idle' })
})

it('drives a 3D enemy with Chaser, and emits no Sprite, Hitbox or Solid for either (CA-30)', async () => {
  const project = await thirdPersonProject()
  const enemy = await scaffolded(project, 'ghoul', 'enemy')
  const player = await scaffolded(project, 'hero', 'player')

  expect(typesOf(enemy).slice(0, 5)).toEqual(['Model', 'RigidBody', 'Collider', 'StateMachine', 'Chaser'])
  for (const prefab of [enemy, player]) {
    for (const flat of ['Sprite', 'Hitbox', 'Solid', 'Hazard', 'AnimatedSprite']) expect(typesOf(prefab)).not.toContain(flat)
  }
})

it('scaffolds a player and an enemy a 3D scene validates with zero errors: no Animator until a glb replaces the box (CA-30)', async () => {
  const project = await thirdPersonProject()
  await scaffolded(project, 'hero', 'player')
  await scaffolded(project, 'ghoul', 'enemy')
  const scene = {
    waicaScene: 3,
    render: { space: '3d' },
    camera: { kind: 'perspective', follow: 'Hero' },
    entities: [
      { name: 'Hero', prefab: 'characters/hero', position: [0, 0, 0] },
      { name: 'Ghoul', prefab: 'characters/ghoul', position: [3, 0, 3] },
    ],
  }
  await mkdir(path.join(project, 'src/scenes'), { recursive: true })
  await writeFile(path.join(project, 'src/scenes/main.scene.json'), JSON.stringify(scene))

  const { findings } = await validateProject(project)
  expect(findings.filter((finding) => finding.severity === 'error')).toEqual([])
}, 60_000)

it.each([
  ['character', 'player', 'player'],
  ['character', 'enemy', 'enemy'],
  ['object', undefined, undefined],
  ['tile', undefined, undefined],
] as ReadonlyArray<[PrefabJson['type'], string | undefined, CharacterIdentity | undefined]>)(
  'writes the exact bytes the editor writes for a 3D %s (role %s, identity %s) (CA-30)',
  async (type, role, identity) => {
    // The editor reads the role from the engine's registry, which a third-person project's bundle fills.
    installArchetype(THIRD_PERSON.bundle)
    const project = await thirdPersonProject()
    const result = await scaffoldPrefab(project, 'thing', type, role, identity)

    expect(await readFile(path.join(project, result.path), 'utf8')).toBe(
      JSON.stringify({ waicaPrefab: 1, type, components: newPrefabComponents3d(type, role, identity) }, null, 2) + '\n',
    )
  },
)

it('still rejects a role the 3D archetype does not define (CA-30)', async () => {
  const project = await thirdPersonProject()

  await expect(scaffoldPrefab(project, 'thing', 'character', 'patroller', 'enemy')).rejects.toMatchObject({
    body: { code: 'unknown-role', available: ['enemy', 'player'] },
  })
})

it('makes a 3D object a sensor Model and a 3D tile a fixed one (CA-30)', async () => {
  const project = await thirdPersonProject()
  const read = async (name: string, type: string): Promise<PrefabJson> =>
    JSON.parse(await readFile(path.join(project, (await scaffoldPrefab(project, name, type)).path), 'utf8')) as PrefabJson

  expect((await read('crate', 'object')).components).toEqual([
    { type: 'Model', props: { shape: 'box' } },
    { type: 'Collider', props: { sensor: true } },
  ])
  expect((await read('block', 'tile')).components).toEqual([{ type: 'Model', props: { shape: 'box' } }, { type: 'Collider' }])
})

it('gives a 3D enemy a MeleeAttack, so the enemy role can wind up and strike (CA-30)', async () => {
  const project = await thirdPersonProject()

  expect(typesOf(await scaffolded(project, 'ghoul', 'enemy'))).toContain('MeleeAttack')
})

it('scaffolds an object or a tile with no resolvable archetype exactly as before: the 2D set (CA-30)', async () => {
  const platformer = await makeProject()
  const unknown = await makeProject({ 'src/game.json': JSON.stringify({ waicaGame: 1 }) })
  roots.push(platformer, unknown)
  for (const type of ['object', 'tile']) {
    const [expected, actual] = await Promise.all(
      [platformer, unknown].map(async (project) => readFile(path.join(project, (await scaffoldPrefab(project, 'thing', type)).path), 'utf8')),
    )
    expect(actual, type).toBe(expected)
  }
})
