import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { installArchetype, type PrefabJson } from '@waica/engine'
import { ARCHETYPE } from '@waica/archetype-platformer/manifest'
import {
  componentClassName,
  componentFilePath,
  componentFileTemplate,
} from '../../editor/src/project/components.js'
import {
  roleFilePath,
  roleFileTemplate,
  stateFilePath,
  stateFileTemplate,
} from '../../editor/src/project/states.js'
import {
  newPrefabComponents,
  type CharacterIdentity,
} from '../../editor/src/project/chassis.js'
import { PREFAB_DIRS, prefabPath } from '../../editor/src/fs/prefab-fs.js'
import { NEW_UI_HTML, uiPath } from '../../editor/src/fs/ui-fs.js'
import { cleanup, makeProject, writeTree } from './test-helpers.js'
import {
  scaffoldComponent,
  scaffoldPrefab,
  scaffoldRole,
  scaffoldState,
  scaffoldUi,
} from './scaffolds.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

describe('scaffolds', () => {
  it.each(['dash boost', 'enemy-AI', 'HealthPoints'])(
    'scaffolds component %s with exact editor naming and bytes',
    async (name) => {
      const project = await makeProject()
      roots.push(project)

      const result = await scaffoldComponent(project, name)
      const expectedPath = componentFilePath(name)

      expect(result).toEqual({
        path: expectedPath,
        created: true,
        className: componentClassName(name),
      })
      expect(await readFile(path.join(project, expectedPath), 'utf8')).toBe(
        componentFileTemplate(name),
      )
    },
  )

  it('scaffolds a component with no placeholder field, exactly like the editor', async () => {
    const project = await makeProject()
    roots.push(project)

    await scaffoldComponent(project, 'dash')
    const code = await readFile(path.join(project, componentFilePath('dash')), 'utf8')

    expect(code).not.toContain('params')
    expect(code).not.toContain('speed')
    expect(code).not.toContain('updateAfter')
  })

  it('rejects the reserved Component class exactly like the editor', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(scaffoldComponent(project, 'component')).rejects.toThrow(
      '"Component" is the engine base class — pick another name.',
    )
  })

  it('scaffolds the exact role template', async () => {
    const project = await makeProject()
    roots.push(project)
    const result = await scaffoldRole(project, 'guard')
    expect(result).toEqual({ path: roleFilePath('guard'), created: true })
    expect(await readFile(path.join(project, roleFilePath('guard')), 'utf8')).toBe(
      roleFileTemplate('guard'),
    )
  })

  it.each(['dash-state', '2fast'])(
    'rejects state name %s instead of emitting invalid TypeScript',
    async (state) => {
      const project = await makeProject()
      roots.push(project)
      await expect(scaffoldState(project, 'player', state)).rejects.toThrow(/TypeScript identifier/)
    },
  )

  it.each([
    ['player', 'dash'],
    ['guard', 'alert'],
  ])('scaffolds the exact %s state branch', async (role, state) => {
    const project = await makeProject()
    roots.push(project)
    const result = await scaffoldState(project, role, state)
    expect(result).toEqual({ path: stateFilePath(state), created: true })
    expect(await readFile(path.join(project, stateFilePath(state)), 'utf8')).toBe(
      stateFileTemplate(role, state),
    )
  })

  it('scaffolds the exact UI starter', async () => {
    const project = await makeProject()
    roots.push(project)
    const result = await scaffoldUi(project, 'status')
    expect(result).toEqual({ path: uiPath('status'), created: true })
    expect(await readFile(path.join(project, uiPath('status')), 'utf8')).toBe(NEW_UI_HTML)
  })

  it('never overwrites an existing target and reports exists as success', async () => {
    const project = await makeProject()
    roots.push(project)
    await writeTree(project, { 'src/roles/guard.ts': '// keep me\n' })

    expect(await scaffoldRole(project, 'guard')).toEqual({
      path: 'src/roles/guard.ts',
      created: false,
      reason: 'exists',
    })
    expect(await readFile(path.join(project, 'src/roles/guard.ts'), 'utf8')).toBe('// keep me\n')
  })
})

/** type -> directory, read off the editor's own map rather than restated here. */
const DIRECTORY_BY_TYPE = Object.fromEntries(
  Object.entries(PREFAB_DIRS).map(([directory, type]) => [type, directory]),
) as Record<PrefabJson['type'], string>

describe('scaffoldPrefab', () => {
  // newPrefabComponents reads the role out of the engine's registry, which a
  // project populates by running its archetype bundle. The editor installs it
  // at load; here the oracle needs the same baseline to compare against.
  beforeAll(() => installArchetype(ARCHETYPE.bundle))

  it.each([
    ['character', undefined, undefined],
    ['character', 'player', 'player'],
    ['character', 'patroller', 'enemy'],
    ['character', 'npc', undefined],
    ['object', undefined, undefined],
    ['tile', undefined, undefined],
  ] as ReadonlyArray<[PrefabJson['type'], string | undefined, CharacterIdentity | undefined]>)(
    'writes the exact bytes the editor writes for a %s (role %s, identity %s)',
    async (type, role, identity) => {
      const project = await makeProject()
      roots.push(project)

      const result = await scaffoldPrefab(project, 'bullet', type, role, identity)

      const expectedPath = prefabPath(`${DIRECTORY_BY_TYPE[type]}/bullet`)
      expect(result).toEqual({ path: expectedPath, created: true })
      expect(await readFile(path.join(project, expectedPath), 'utf8')).toBe(
        JSON.stringify(
          { waicaPrefab: 1, type, components: newPrefabComponents(type, role, identity) },
          null,
          2,
        ) + '\n',
      )
    },
  )

  it('never overwrites an existing prefab and reports exists as success', async () => {
    const project = await makeProject()
    roots.push(project)
    await writeTree(project, { 'src/objects/bullet.object.json': '// mine\n' })

    expect(await scaffoldPrefab(project, 'bullet', 'object')).toEqual({
      path: 'src/objects/bullet.object.json',
      created: false,
      reason: 'exists',
    })
    expect(await readFile(path.join(project, 'src/objects/bullet.object.json'), 'utf8')).toBe(
      '// mine\n',
    )
  })

  it.each(['../escape', 'has space', '-'])('rejects the unsafe name %s', async (name) => {
    const project = await makeProject()
    roots.push(project)
    await expect(scaffoldPrefab(project, name, 'object')).rejects.toThrow(
      /letters, numbers, hyphens or underscores/,
    )
  })

  it('rejects an unknown prefab type instead of guessing a directory', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(scaffoldPrefab(project, 'bullet', 'vehicle')).rejects.toThrow(
      /character, object, tile/,
    )
  })

  // PREFAB_DIRECTORIES is an object literal: an unguarded index lookup lets
  // these inherited Object.prototype keys through as a truthy "directory",
  // which used to write the prefab into a garbage path instead of rejecting
  // it like any other unknown type.
  it.each(['toString', 'constructor', 'valueOf'])(
    'rejects the inherited-property type %s instead of resolving Object.prototype',
    async (type) => {
      const project = await makeProject()
      roots.push(project)
      await expect(scaffoldPrefab(project, 'bullet', type)).rejects.toThrow(
        /character, object, tile/,
      )
    },
  )

  // A character born with a role the archetype never defined would get an
  // empty state graph and no driver — the silent broken prefab this refuses.
  it('rejects a role the archetype does not define and lists the ones it does', async () => {
    const project = await makeProject()
    roots.push(project)

    await expect(scaffoldPrefab(project, 'hero', 'character', 'wizard')).rejects.toThrow(
      /wizard.*chaser, npc, patroller, player/s,
    )
  })

  it('rejects an unknown character identity', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(
      scaffoldPrefab(project, 'hero', 'character', 'player', 'boss'),
    ).rejects.toThrow(/player, enemy, npc, custom/)
  })

  // The editor's creation dialog never lets you pick a non-player identity
  // without also picking a movement role; scaffold_prefab defaulting role to
  // "player" here would silently give an enemy/npc/custom the player's own
  // driver instead.
  it.each(['enemy', 'npc', 'custom'] as const)(
    'rejects identity %s with no explicit role instead of defaulting to player',
    async (identity) => {
      const project = await makeProject()
      roots.push(project)
      await expect(
        scaffoldPrefab(project, 'hero', 'character', undefined, identity),
      ).rejects.toThrow(/role/i)
    },
  )

  it('refuses a role or identity on a type that has neither', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(scaffoldPrefab(project, 'coin', 'object', 'player')).rejects.toThrow(
      /character-only/,
    )
    await expect(
      scaffoldPrefab(project, 'coin', 'object', undefined, 'player'),
    ).rejects.toThrow(/character-only/)
  })
})
