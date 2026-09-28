// Test support for the Editor characterization tests (excluded from builds).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import { MemFS } from '../fs/project-fs'
import { Editor } from './Editor'
import { saveWorkspace } from './workspace'

/**
 * The Editor as a whole: the three.js viewport and Monaco are stood in by
 * the accessible stubs of test-editor-stubs.tsx (each test file registers
 * them with vi.mock); everything else is the real thing.
 */

const storage = new Map<string, string>()
const localStorageStub = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
}

export const confirmStub = vi.fn((): boolean => true)
export const alertStub = vi.fn((): void => {})

export const MAIN = 'src/scenes/main.scene.json'
export const LEVEL = 'src/scenes/level-2.scene.json'

export const crate: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0xffaa00 } }],
}

export function mainScene(): SceneJson {
  return {
    waicaScene: 3,
    entities: [
      { name: 'Hero', position: [0, 0], components: [] },
      { name: 'Box', prefab: 'objects/crate', position: [2, 0] },
    ],
  }
}

export function project(files: Record<string, string> = {}): MemFS {
  return new MemFS('char-project', {
    'src/game.json': JSON.stringify({
      waicaGame: 1,
      archetype: 'platformer',
      resolution: { mode: 'fill', width: 640, height: 360 },
      pixelsPerUnit: 16,
    }),
    [MAIN]: JSON.stringify(mainScene()),
    [LEVEL]: JSON.stringify({
      waicaScene: 3,
      entities: [{ name: 'Door', prefab: 'objects/crate', position: [1, 1] }],
    }),
    'src/objects/crate.object.json': JSON.stringify(crate),
    ...files,
  })
}

export async function readScene(fs: MemFS, path: string): Promise<SceneJson> {
  const text = defined(await fs.readText(path), path)
  return JSON.parse(text) as SceneJson
}

export function viewportEntities(): string[] {
  const list = screen.getByRole('list', { name: 'viewport entities' })
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

export function openEditor(fs: MemFS, onClose = vi.fn()) {
  const user = userEvent.setup()
  const view = render(<Editor fs={fs} onClose={onClose} />, { reactStrictMode: true })
  return { user, onClose, ...view }
}

export async function openAtMainScene(fs = project()) {
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await screen.findByRole('region', { name: 'viewport' })
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Hero', 'Box']))
  return { fs, ...opened }
}

/** Registers the browser globals every Editor characterization test needs. */
export function installEditorGlobals(): void {
beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', localStorageStub)
  vi.stubGlobal('confirm', confirmStub)
  vi.stubGlobal('alert', alertStub)
})

afterEach(() => {
  cleanup()
  confirmStub.mockClear()
  alertStub.mockClear()
  vi.unstubAllGlobals()
})
}
