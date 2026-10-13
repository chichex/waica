import { afterEach, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PrefabJson } from '@waica/engine'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { scaffoldPrefab } from './scaffolds.js'
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

it('gives a 3D player a Model, a kinematic body, a capsule, an Animator, its machine and its motor (CA-30)', async () => {
  const project = await thirdPersonProject()
  const prefab = await scaffolded(project, 'hero', 'player')

  expect(typesOf(prefab).slice(0, 6)).toEqual(['Model', 'RigidBody', 'Collider', 'Animator', 'StateMachine', 'CharacterMotor'])
  expect(prefab.components[1]?.props).toEqual({ type: 'kinematic' })
  expect(prefab.components[2]?.props).toMatchObject({ shape: 'capsule' })
  expect(prefab.components[4]?.props).toMatchObject({ role: 'player', initial: 'idle' })
})

it('drives a 3D enemy with Chaser, and emits no Sprite, Hitbox or Solid for either (CA-30)', async () => {
  const project = await thirdPersonProject()
  const enemy = await scaffolded(project, 'ghoul', 'enemy')
  const player = await scaffolded(project, 'hero', 'player')

  expect(typesOf(enemy).slice(0, 6)).toEqual(['Model', 'RigidBody', 'Collider', 'Animator', 'StateMachine', 'Chaser'])
  for (const prefab of [enemy, player]) {
    for (const flat of ['Sprite', 'Hitbox', 'Solid', 'Hazard', 'AnimatedSprite']) expect(typesOf(prefab)).not.toContain(flat)
  }
})

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
