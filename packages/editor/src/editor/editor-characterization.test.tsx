// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import { MemFS } from '../fs/project-fs'
import { saveWorkspace } from './workspace'

/**
 * Characterization of the Editor as a whole: what it shows for a project and
 * what reaches the project files after the main interactions. The three.js
 * viewport and Monaco are stood in by small accessible stubs; everything else
 * (Explorer, Inspector, history, persistence) is the real thing.
 */

interface ViewportStubProps {
  scene: SceneJson
  mode: 'edit' | 'play'
  onMoved: (name: string, position: [number, number]) => void
  onDropPrefab?: (data: string, world: [number, number]) => void
}

vi.mock('./Viewport', () => ({
  Viewport: ({ scene, mode, onMoved, onDropPrefab }: ViewportStubProps) => (
    <section aria-label="viewport">
      <p>{`viewport mode: ${mode}`}</p>
      <ul aria-label="viewport entities">
        {scene.entities.map((entity) => (
          <li key={entity.name}>{entity.name}</li>
        ))}
      </ul>
      <button
        onClick={() => {
          const first = scene.entities[0]
          if (first) onMoved(first.name, [3, 4])
        }}
      >
        move first entity
      </button>
      {onDropPrefab && (
        <button onClick={() => onDropPrefab('objects/crate', [1.234, 2.345])}>drop crate</button>
      )}
    </section>
  ),
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (next: string) => void }) => (
    <textarea aria-label="code source" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}))

vi.mock('./play-runner', () => ({
  transpile: (source: string) => Promise.resolve(source),
  createModule: () => Promise.resolve('data:text/javascript,'),
  execute: () => Promise.resolve({}),
  reset: () => {},
}))

import { Editor } from './Editor'

const storage = new Map<string, string>()
const localStorageStub = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
}

const confirmStub = vi.fn((): boolean => true)
const alertStub = vi.fn((): void => {})

const MAIN = 'src/scenes/main.scene.json'
const LEVEL = 'src/scenes/level-2.scene.json'

const crate: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0xffaa00 } }],
}

function mainScene(): SceneJson {
  return {
    waicaScene: 3,
    entities: [
      { name: 'Hero', position: [0, 0], components: [] },
      { name: 'Box', prefab: 'objects/crate', position: [2, 0] },
    ],
  }
}

function project(files: Record<string, string> = {}): MemFS {
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

async function readScene(fs: MemFS, path: string): Promise<SceneJson> {
  const text = defined(await fs.readText(path), path)
  return JSON.parse(text) as SceneJson
}

function viewportEntities(): string[] {
  const list = screen.getByRole('list', { name: 'viewport entities' })
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

function openEditor(fs: MemFS, onClose = vi.fn()) {
  const user = userEvent.setup()
  const view = render(<Editor fs={fs} onClose={onClose} />, { reactStrictMode: true })
  return { user, onClose, ...view }
}

async function openAtMainScene(fs = project()) {
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await screen.findByRole('region', { name: 'viewport' })
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Hero', 'Box']))
  return { fs, ...opened }
}

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

describe('Editor characterization: toolbar and workspace', () => {
  it('shows the project in the toolbar and asks to pick something without a saved workspace', async () => {
    openEditor(project())

    expect(await screen.findByText('in-memory demo')).toBeDefined()
    expect(screen.getByText('select something on the left to open it')).toBeDefined()
    const picker = screen.getByRole('combobox', { name: 'Scene to play' })
    await vi.waitFor(() =>
      expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'scene…',
        'level-2',
        'main',
      ]),
    )
    expect(screen.getByRole('button', { name: '▶ Play' })).toHaveProperty('disabled', true)
    expect(screen.getByText('saved ✓')).toBeDefined()
  })

  it('reopens the saved scene with its breadcrumb and entities', async () => {
    await openAtMainScene()

    expect(screen.getByRole('combobox')).toHaveProperty('value', MAIN)
    expect(screen.getByText('viewport mode: edit')).toBeDefined()
    expect(screen.getByRole('button', { name: '▶ Play' })).toHaveProperty('disabled', false)
  })

})

describe('Editor characterization: entity history', () => {
  it('adds an entity, undoes and redoes it from the keyboard, and saves the result', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New entity' }))
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Entity'])
    expect(screen.getByText('saving…')).toBeDefined()

    await user.keyboard('{Control>}z{/Control}')
    expect(viewportEntities()).toEqual(['Hero', 'Box'])

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Entity'])

    unmount()
    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities.map((e) => e.name)).toEqual(['Hero', 'Box', 'Entity'])
    })
  })

})

describe('Editor characterization: viewport edits', () => {
  it('writes a viewport move into the scene file', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: 'move first entity' }))
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[0]?.position).toEqual([3, 4])
    })
  })

  it('drops a prefab from the library into the scene, rounded and selected', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: 'drop crate' }))
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Crate'])
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[2]).toEqual({
        name: 'Crate',
        prefab: 'objects/crate',
        position: [1.23, 2.35],
      })
    })
  })

  it('duplicates the selected entity with Ctrl+D', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    await user.keyboard('{Control>}d{/Control}')

    expect(viewportEntities()).toHaveLength(3)
    expect(viewportEntities()[2]).toMatch(/^Hero/)
  })

})

describe('Editor characterization: entity selection edits', () => {
  it('groups the selected entity into a new folder with Ctrl+G', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    await user.keyboard('{Control>}g{/Control}')
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities.find((e) => e.name === 'Hero')?.folder).toBe('Group')
    })
  })

  it('moves the selected entity from the inspector position field', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    const [x] = screen.getAllByRole('spinbutton')
    await user.clear(defined(x, 'the x field'))
    await user.type(defined(x, 'the x field'), '7')
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[0]?.position).toEqual([7, 0])
    })
  })

  it('renames an entity from the explorer', async () => {
    const { user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: /Hero$/ }))
    // The rename field takes focus with its text selected: typing replaces it.
    await user.keyboard('Player{Enter}')

    expect(viewportEntities()).toEqual(['Player', 'Box'])
  })

})

describe('Editor characterization: scene files', () => {
  it('creates a new scene file and opens it', async () => {
    const { fs, user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New scene' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveProperty('value', 'src/scenes/scene-1.scene.json'),
    )
    expect(await readScene(fs, 'src/scenes/scene-1.scene.json')).toEqual({
      waicaScene: 3,
      entities: [],
    })
  })

  it('switches scenes from the toolbar picker', async () => {
    const { user } = await openAtMainScene()

    await user.selectOptions(screen.getByRole('combobox'), LEVEL)

    await vi.waitFor(() => expect(viewportEntities()).toEqual(['Door']))
  })

  it('deletes a scene after confirming, and undo brings the file back', async () => {
    const { fs, user } = await openAtMainScene()

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /level-2$/ }),
    })
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }))

    expect(confirmStub).toHaveBeenCalledWith('Delete level-2.scene.json?')
    await vi.waitFor(async () => expect(await fs.readText(LEVEL)).toBeNull())

    await user.keyboard('{Control>}z{/Control}')
    await vi.waitFor(async () => expect(await fs.readText(LEVEL)).not.toBeNull())
    await vi.waitFor(() => expect(viewportEntities()).toEqual(['Door']))
  })

})

describe('Editor characterization: prefab creation', () => {
  it('creates an object prefab and opens it with the prefab breadcrumb', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New object' }))

    expect(screen.getByText('objects / object-1')).toBeDefined()
    expect(screen.getByText('edits reach every instance')).toBeDefined()
    unmount()
    await vi.waitFor(async () =>
      expect(await fs.readText('src/objects/object-1.object.json')).not.toBeNull(),
    )
  })

  it('creates a character through the role picker', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New character' }))
    expect(screen.getByText('New character — what is it?')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.queryByText('New character — what is it?')).toBeNull()
    expect(screen.getByText('characters / character-1')).toBeDefined()
    unmount()
    await vi.waitFor(async () => {
      const text = defined(await fs.readText('src/characters/character-1.character.json'))
      const prefab = JSON.parse(text) as PrefabJson
      expect(prefab.type).toBe('character')
      const machine = prefab.components.find((c) => c.type === 'StateMachine')
      expect(machine?.props?.role).toBe('player')
    })
  })

})

describe('Editor characterization: prefab renames', () => {
  it('renames a prefab and rewrites every scene that uses it', async () => {
    const { fs, user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: '▣ crate' }))
    await user.keyboard('barrel{Enter}')

    await vi.waitFor(async () =>
      expect(await fs.readText('src/objects/crate.object.json')).toBeNull(),
    )
    expect(await fs.readText('src/objects/barrel.object.json')).not.toBeNull()
    expect((await readScene(fs, MAIN)).entities[1]?.prefab).toBe('objects/barrel')
    expect((await readScene(fs, LEVEL)).entities[0]?.prefab).toBe('objects/barrel')
    expect(screen.getByText('saved ✓')).toBeDefined()
  })

  it('refuses a prefab name with invalid characters', async () => {
    const { fs, user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: '▣ crate' }))
    await user.keyboard('bad name{Enter}')

    expect(alertStub).toHaveBeenCalledWith(
      'Prefab names must start with a letter or number and use only letters, numbers, dashes, or underscores.',
    )
    expect(await fs.readText('src/objects/crate.object.json')).not.toBeNull()
  })

})

describe('Editor characterization: UI pieces', () => {
  it('creates a UI piece and saves its edits', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New UI piece' }))
    expect(screen.getByRole('button', { name: /ui-1$/ })).toBeDefined()
    const source = screen.getByRole('textbox', { name: 'code source' })
    await user.clear(source)
    await user.type(source, '<b>hi</b>')
    unmount()

    await vi.waitFor(async () => expect(await fs.readText('src/ui/ui-1.html')).toBe('<b>hi</b>'))
  })

})

describe('Editor characterization: views, play and exit', () => {
  it('opens the project settings views with the file they save to', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /controls$/ }))
    expect(await screen.findByText('saved to src/controls.json')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /stats$/ }))
    expect(await screen.findByText('saved to src/stats.json')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /game$/ }))
    expect(await screen.findByText('saved to src/game.json')).toBeDefined()

    await user.click(screen.getByRole('button', { name: /← .*main/ }))
    expect(screen.getByRole('region', { name: 'viewport' })).toBeDefined()
  })

  it('plays the open scene and stops back to edit mode', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: '▶ Play' }))
    expect(await screen.findByText('viewport mode: play')).toBeDefined()
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: '⏹ Stop' }))
    expect(screen.getByText('viewport mode: edit')).toBeDefined()
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', false)
  })

  it('goes back to the projects list', async () => {
    const { user, onClose } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: '← projects' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

})

describe('Editor characterization: failures', () => {
  it('shows an unknown archetype as an alert with a way back', async () => {
    const fs = project({
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'no-such-archetype' }),
    })
    const { user, onClose } = openEditor(fs)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toMatch(/no-such-archetype/)
    await user.click(screen.getByRole('button', { name: '← projects' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
