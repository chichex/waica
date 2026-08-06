import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
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
import { NEW_UI_HTML, uiPath } from '../../editor/src/fs/ui-fs.js'
import { cleanup, makeProject, writeTree } from './test-helpers.js'
import {
  scaffoldComponent,
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
