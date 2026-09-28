// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SceneJson } from '@waica/engine'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Explorer } from './Explorer'
import { defined, match } from '../../../engine/src/test-support'

// Characterization of the Explorer's Scenes panel — scene list, camera,
// scene UI pieces, entity and folder rows, keyboard shortcuts, context
// menus and drag-and-drop reordering — pinned before splitting Explorer.tsx
// by responsibility.

afterEach(cleanup)

type ExplorerProps = ComponentProps<typeof Explorer>

const spy = () => vi.fn<(...args: unknown[]) => void>()

function explorerSpies() {
  return {
    onRefreshArt: spy(), onOpenScene: spy(), onSelectEntity: spy(), onToggleEntity: spy(),
    onRangeEntities: spy(), onClearSelection: spy(), onSelectCamera: spy(), onAddEntity: spy(),
    onCreateScene: spy(), onCreateFolder: spy(), onRenameFolder: spy(), onDissolveFolder: spy(),
    onDeleteFolder: spy(), onReorderEntity: spy(), onReorderFolder: spy(), onOpenPrefab: spy(),
    onOpenScript: spy(), onCreateComponent: spy(), onOpenComponentFile: spy(), onOpenStateFile: spy(),
    onOpenArt: spy(), onOpenControls: spy(), onOpenStats: spy(), onOpenGame: spy(), onDuplicateScene: spy(),
    onDeleteScene: spy(), onDuplicateEntity: spy(), onDeleteEntity: spy(), onRenameEntity: spy(),
    onDeleteEntities: spy(), onDuplicateEntities: spy(), onReorderEntities: spy(), onCreatePrefab: spy(),
    onDuplicatePrefab: spy(), onRenamePrefab: spy(), onDeletePrefab: spy(), onAddPrefabToScene: spy(),
    onOpenUi: spy(), onCreateUi: spy(), onDuplicateUi: spy(), onDeleteUi: spy(), onToggleUiInScene: spy(),
    onArtDeleted: spy(), onPreviewSound: spy(), onStopPreview: spy(),
    onImportArt: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
    toggleFolder: spy(), openFolder: spy(), setAllFolders: spy(),
  }
}

const SCENE: SceneJson = {
  waicaScene: 3,
  entities: [
    { name: 'hero' },
    { name: 'coin1', folder: 'coins' },
    { name: 'coin2', folder: 'coins' },
    { name: 'wall' },
  ],
  folders: ['coins', 'empty'],
  ui: ['hud'],
}

function renderExplorer(overrides: Partial<ExplorerProps> = {}): ReturnType<typeof explorerSpies> {
  const spies = explorerSpies()
  const props: ExplorerProps = {
    ...spies,
    fs: new MemFS('proj', {}), scenePaths: ['src/scenes/main.scene.json', 'src/scenes/boss.scene.json'],
    openScenePath: 'src/scenes/main.scene.json', scene: SCENE, view: { kind: 'scene', path: 'main' },
    sceneFolders: {
      expanded: new Set(['coins']), toggle: spies.toggleFolder, open: spies.openFolder, setAll: spies.setAllFolders,
    },
    selected: null, multi: [], prefabLib: {}, uiLib: {}, art: [], importProgress: null, customComponents: [],
    stateFiles: [], roleFiles: [], mode: 'edit', previewingPath: null,
    ...overrides,
  }
  render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>
      <Explorer {...props} />
    </ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
  return spies
}

const row = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name })

async function menuItem(target: HTMLElement, label: string | RegExp): Promise<void> {
  const user = userEvent.setup()
  await user.pointer({ keys: '[MouseRight]', target })
  await user.click(screen.getByRole('menuitem', { name: label }))
}

describe('Explorer scenes panel (characterization): scenes', () => {
  it('lists scenes, opens one, and offers scene actions in its menu', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer()

    await user.click(row('▸ 🎬 boss'))
    expect(spies.onOpenScene).toHaveBeenCalledWith('src/scenes/boss.scene.json')
    await menuItem(row('▾ 🎬 main'), /Duplicate/)
    expect(spies.onDuplicateScene).toHaveBeenCalledWith('src/scenes/main.scene.json')
    await menuItem(row('▾ 🎬 main'), /New folder/)
    expect(spies.onCreateFolder).toHaveBeenCalledTimes(1)
    await menuItem(row('▸ 🎬 boss'), /Delete/)
    expect(spies.onDeleteScene).toHaveBeenCalledWith('src/scenes/boss.scene.json')
  })

  it('creates scenes and entities from the header buttons and the panel menu', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer({ scenePaths: ['src/scenes/main.scene.json'] })

    await user.click(screen.getByRole('button', { description: 'New scene' }))
    await user.click(screen.getByRole('button', { description: 'New entity' }))
    await menuItem(screen.getByText('Scenes'), /New entity/)
    expect(spies.onCreateScene).toHaveBeenCalledTimes(1)
    expect(spies.onAddEntity).toHaveBeenCalledTimes(2)
    await user.pointer({ keys: '[MouseRight]', target: row('▾ 🎬 main') })
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toHaveProperty('disabled', true)
  })

  it('selects the camera and opens the scene UI pieces', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer()

    await user.click(row('🎥 Camera'))
    expect(spies.onSelectCamera).toHaveBeenCalledTimes(1)
    await user.click(row('🧩 hud'))
    expect(spies.onOpenUi).toHaveBeenCalledWith('hud')
    await menuItem(row('🧩 hud'), /Remove from scene/)
    expect(spies.onToggleUiInScene).toHaveBeenCalledWith('hud')
  })
})

describe('Explorer scenes panel (characterization): entities', () => {
  it('shows root entities and expanded folders, selecting by click, shift-range and cmd-toggle', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer({ selected: 'hero' })

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(
      match.arrayContaining(['▢hero', '▾📂coins2', '▢coin1', '▢coin2', '▢wall', '▸📁empty0']),
    )
    await user.click(row('▢ wall'))
    expect(spies.onSelectEntity).toHaveBeenCalledWith('wall')
    await user.keyboard('{Shift>}')
    await user.click(row('▢ coin2'))
    await user.keyboard('{/Shift}{Meta>}')
    await user.click(row('▢ coin1'))
    await user.keyboard('{/Meta}')
    expect(spies.onRangeEntities).toHaveBeenCalledWith(['hero', 'coin1', 'coin2'])
    expect(spies.onToggleEntity).toHaveBeenCalledWith('coin1')
  })

  it('renames an entity inline: Enter commits, Escape cancels', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer()

    await user.dblClick(row('▢ hero'))
    const field = screen.getByDisplayValue('hero')
    await user.clear(field)
    await user.type(field, 'player{Enter}')
    expect(spies.onRenameEntity).toHaveBeenCalledWith('hero', 'player')

    await menuItem(row('▢ wall'), /Rename/)
    await user.keyboard('{Escape}')
    expect(screen.queryByDisplayValue('wall')).toBeNull()
  })

})

describe('Explorer scenes panel (characterization): entity menus', () => {
  it('offers duplicate, move and delete in an entity menu', async () => {
    const spies = renderExplorer()

    await menuItem(row('▢ coin1'), /Move to root/)
    expect(spies.onSelectEntity).toHaveBeenCalledWith('coin1')
    expect(spies.onReorderEntity).toHaveBeenCalledWith('coin1', 'end')
    await menuItem(row('▢ hero'), /Move to coins/)
    expect(spies.onReorderEntity).toHaveBeenLastCalledWith('hero', { into: 'coins' })
    await menuItem(row('▢ hero'), /Duplicate/)
    await menuItem(row('▢ hero'), /Delete/)
    expect(spies.onDuplicateEntity).toHaveBeenCalledWith('hero')
    expect(spies.onDeleteEntity).toHaveBeenCalledWith('hero')
  })

  it('acts on the whole multi-selection from its menu', async () => {
    const spies = renderExplorer({ multi: ['hero', 'wall'] })

    await menuItem(row('▢ wall'), /Duplicate 2 entities/)
    await menuItem(row('▢ wall'), /Move to empty/)
    await menuItem(row('▢ hero'), /Delete 2 entities/)
    expect(spies.onDuplicateEntities).toHaveBeenCalledWith(['hero', 'wall'])
    expect(spies.onReorderEntities).toHaveBeenCalledWith(['hero', 'wall'], { into: 'empty' })
    expect(spies.onDeleteEntities).toHaveBeenCalledWith(['hero', 'wall'])
  })
})

describe('Explorer scenes panel (characterization): keyboard', () => {
  it('deletes, duplicates, renames, selects all and clears from the focused tree', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer({ selected: 'wall' })

    row('▢ wall').focus()
    await user.keyboard('{Delete}')
    await user.keyboard('{Meta>}d{/Meta}')
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('{Escape}')
    expect(spies.onDeleteEntities).toHaveBeenCalledWith(['wall'])
    expect(spies.onDuplicateEntities).toHaveBeenCalledWith(['wall'])
    expect(spies.onRangeEntities).toHaveBeenCalledWith(['hero', 'coin1', 'coin2', 'wall'])
    expect(spies.onClearSelection).toHaveBeenCalledTimes(1)
    await user.keyboard('{F2}')
    expect(screen.getByDisplayValue('wall')).toBeDefined()
  })
})

describe('Explorer scenes panel (characterization): folders', () => {
  it('toggles a folder, syncs all folders on alt-click and renames it inline', async () => {
    const user = userEvent.setup()
    const spies = renderExplorer()

    await user.click(row('▾ 📂 coins 2'))
    expect(spies.toggleFolder).toHaveBeenCalledWith('coins')
    await user.keyboard('{Alt>}')
    await user.click(row('▸ 📁 empty 0'))
    await user.keyboard('{/Alt}')
    expect(spies.setAllFolders).toHaveBeenCalledWith(['coins', 'empty'])
    await user.dblClick(row('▸ 📁 empty 0'))
    const field = screen.getByDisplayValue('empty')
    await user.clear(field)
    await user.type(field, 'spare{Enter}')
    expect(spies.onRenameFolder).toHaveBeenCalledWith('empty', 'spare')
  })

  it('dissolves or deletes a folder from its menu', async () => {
    const spies = renderExplorer()

    await menuItem(row('▾ 📂 coins 2'), /Dissolve/)
    await menuItem(row('▾ 📂 coins 2'), /Delete with entities/)
    expect(spies.onDissolveFolder).toHaveBeenCalledWith('coins')
    expect(spies.onDeleteFolder).toHaveBeenCalledWith('coins')
  })
})

/** A stand-in for the browser's DataTransfer, which the test DOM lacks. */
function dataTransfer() {
  const data = new Map<string, string>()
  const types: string[] = []
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    types,
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  }
}

describe('Explorer scenes panel (characterization): drag and drop', () => {
  it('reorders an entity after another, into a folder and to the root end', () => {
    const spies = renderExplorer()
    const drag = (source: HTMLElement, target: HTMLElement): void => {
      const transfer = dataTransfer()
      fireEvent.dragStart(source, { dataTransfer: transfer })
      fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 0 })
      fireEvent.drop(target, { dataTransfer: transfer })
      fireEvent.dragEnd(source, { dataTransfer: transfer })
    }

    drag(row('▢ hero'), row('▢ wall'))
    expect(spies.onReorderEntity).toHaveBeenLastCalledWith('hero', { afterEntity: 'wall' })
    drag(row('▢ hero'), row('▸ 📁 empty 0'))
    expect(spies.openFolder).toHaveBeenCalledWith('empty')
    expect(spies.onReorderEntity).toHaveBeenLastCalledWith('hero', { into: 'empty' })

    const transfer = dataTransfer()
    fireEvent.dragStart(row('▾ 📂 coins 2'), { dataTransfer: transfer })
    const end = defined(screen.getByTitle('Drop here for root level, last'))
    fireEvent.dragOver(end, { dataTransfer: transfer })
    fireEvent.drop(end, { dataTransfer: transfer })
    expect(spies.onReorderFolder).toHaveBeenCalledWith('coins', 'end')
    expect(within(document.body).queryByTitle('Drop here for root level, last')).toBeNull()
  })

  it('moves a dragged multi-selection as a group', () => {
    const spies = renderExplorer({ multi: ['hero', 'wall'] })
    const transfer = dataTransfer()

    fireEvent.dragStart(row('▢ wall'), { dataTransfer: transfer })
    fireEvent.dragOver(row('▢ coin1'), { dataTransfer: transfer, clientY: 0 })
    fireEvent.drop(row('▢ coin1'), { dataTransfer: transfer })
    expect(spies.onReorderEntities).toHaveBeenCalledWith(['hero', 'wall'], { afterEntity: 'coin1' })
  })
})
