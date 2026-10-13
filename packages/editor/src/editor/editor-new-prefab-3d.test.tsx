// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { THIRD_PERSON_BUNDLE } from '@waica/archetype-third-person'
import { prefabComponents3d } from '../../../mcp/src/scaffolds-3d'
import { MemFS } from '../fs/project-fs'
import { installEditorGlobals, MAIN, openEditor, viewportEntities } from './test-editor-harness'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

// Maintainer decision on issue #181: in a 3D archetype the editor's New prefab writes what scaffold_prefab writes.

const SCENE: SceneJson = { waicaScene: 3, render: { space: '3d' }, entities: [{ name: 'Player', position: [0, 0, 0] }] }

async function openThirdPerson() {
  const fs = new MemFS('new-prefab-3d', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'third-person', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(SCENE),
  })
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Player']))
  return { fs, ...opened }
}

/** The file scaffold_prefab writes for these inputs (packages/mcp/src/scaffolds-3d.ts and its JSON format). */
function scaffolded(type: PrefabJson['type'], role?: string, identity?: 'player' | 'enemy'): string {
  const definition = role ? THIRD_PERSON_BUNDLE.roles[role] : undefined
  const components = prefabComponents3d({ type, role: role ?? 'player', definition, identity })
  return JSON.stringify({ waicaPrefab: 1, type, components }, null, 2) + '\n'
}

it('writes the scaffold’s bytes for a New object, a New tile and a New character in a third-person project', async () => {
  const { fs, user, unmount } = await openThirdPerson()

  await user.click(screen.getByRole('button', { description: 'New object' }))
  await user.click(screen.getByRole('button', { description: 'New tile' }))
  await user.click(screen.getByRole('button', { description: 'New character' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  unmount()

  await vi.waitFor(async () => {
    expect(await fs.readText('src/objects/object-1.object.json')).toBe(scaffolded('object'))
    expect(await fs.readText('src/tiles/tile-1.tile.json')).toBe(scaffolded('tile'))
    expect(await fs.readText('src/characters/character-1.character.json')).toBe(scaffolded('character', 'player', 'player'))
  })
})
